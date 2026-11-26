import { decodePuzzle, encodePuzzle } from './codec';
import { ALL_PACKS } from './levels';
import { pageId } from './levels-sync';
import type { PackRating, PacksMessage, PacksRequest } from './packs.worker';
import { isOneShot, levelKey, pathKey } from './model';
import { boardSize, padFor, renderBoard } from './render';
import type { PackCacheEntry, Storage } from './storage';
import { RATING_VERSION } from './library-table';
import { difficultyLevel } from './difficulty';
import { ICONS } from './icons';
import { el, openSheet, toast } from './ui';

/**
 * Why a level's shape can't be a level, or '' if it's fine: only too long and thin. Which way up
 * a level is, and where its tail is, are each pack's own business.
 */
function shapeProblem(code: string): string {
  const p = decodePuzzle(code);
  return Math.max(p.w, p.h) > 2 * Math.min(p.w, p.h) ? 'more than twice as long as it is wide' : '';
}

/** A pack as edited: its name, kind, whether it's a draft, its levels, and which saved pack it was (none for a new one). */
interface EditPack {
  name: string;
  oneShot: boolean;
  draft: boolean;
  levels: string[];
  from: number | null;
}

/** The packs as saved in src/levels.ts (drafts too), to edit. */
const savedPacks = (): EditPack[] => ALL_PACKS.map((p, i) => ({ name: p.name, oneShot: !!p.oneShot, draft: !!p.draft, levels: [...p.levels], from: i }));

/**
 * The four groups of packs, in the order the file keeps them: classic, one-shot, then the drafts
 * (never shown to players) of each kind.
 */
const GROUPS = [
  { oneShot: false, draft: false, title: 'Classic', add: 'New classic pack' },
  { oneShot: true, draft: false, title: 'One-shot', add: 'New one-shot pack' },
  { oneShot: false, draft: true, title: 'Classic drafts', add: 'New classic draft' },
  { oneShot: true, draft: true, title: 'One-shot drafts', add: 'New one-shot draft' },
];
const groupOf = (k: { oneShot: boolean; draft: boolean }) => (k.draft ? 2 : 0) + (k.oneShot ? 1 : 0);

/** How long (ms) each step of a hint journey shows when hovering over a level: a hint longer. */
const STEP_MS = 600;
const HINT_MS = 1500;
/** The magnified board's longer side (px) while its hint journey plays. */
const ZOOM_PX = 360;
/** Hold this long (ms) on a touch screen before a level picks up, so a swipe still scrolls. */
const HOLD_MS = 300;
/** A press that moves further than this (px) before picking up is a scroll or a stray drag. */
const SLOP = 8;
/** Within this distance (px) of the view's top or bottom edge, a drag scrolls the view. */
const EDGE = 60;

/**
 * The creator's pack organiser: every pack's levels as their solved boards, in play order.
 * Drag a level (on a touch screen, hold it first) to move it within its pack or into another;
 * tap one to edit it. Packs can be renamed, added, deleted, moved up or down (one-shot packs
 * always after the classic ones) and made drafts (hidden from players) or published, puzzles from the
 * Library added to the end of a pack, and levels removed. Save writes it all to src/levels.ts (through the local dev
 * server, the only place the organiser appears).
 */
export class PacksView {
  readonly el: HTMLElement;
  /** Open a level in the editor (tapped, not dragged). */
  onOpen?: (code: string) => void;

  private body: HTMLElement;
  private status: HTMLElement;
  private saveBtn: HTMLButtonElement;
  private revertBtn: HTMLButtonElement;
  /** The packs as edited, in order (classic packs, then one-shot packs). */
  private packs: EditPack[] = savedPacks();
  /** Each level's solution once solved (none if it has none), and whether it's the only one. */
  private solutions = new Map<string, { lines: Set<number> | null; unique: boolean }>();
  /** Hint steps, worked out after the solutions (null if not unique). */
  private ratings = new Map<string, PackRating | null>();
  /** Levels sent to the solver and not back yet. */
  private solving = new Set<string>();
  /** Highlighted levels, kept in this browser: for marking benchmarks while ordering. */
  private marks: Set<string>;
  /** Packs folded away (by name), kept in this browser. */
  private folded: Set<string>;
  /** The tile whose hint journey is playing (while the mouse is over it), and its next step. */
  private playing: { tile: HTMLElement; timer: number; off: () => void } | null = null;
  private worker: Worker | null = null;
  /** What's been worked out, kept in this browser (a Save reloads the page): saved a moment after it changes. */
  private cache: Record<string, PackCacheEntry>;
  private cacheTimer = 0;
  /** A hint journey being worked out for playback (cached ratings keep only the count). */
  private framesWorker: Worker | null = null;
  private drag: {
    tile: HTMLElement;
    ghost: HTMLElement | null;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    offX: number;
    offY: number;
    timer: number;
  } | null = null;
  private scrollFrame = 0;

  constructor(private storage: Storage) {
    this.marks = storage.loadPackMarks();
    this.folded = storage.loadPacksFolded();
    this.cache = {};
    this.loadCache();
    this.el = el('section', 'view packs-view hidden');
    this.el.innerHTML = `
      <div class="packs-top">
        <p class="packs-status" role="status" aria-live="polite"></p>
        <button class="btn" data-act="revert">Revert</button>
        <button class="btn primary" data-act="save">Save</button>
      </div>
      <div class="packs-body"></div>`;
    this.body = this.el.querySelector('.packs-body')!;
    this.status = this.el.querySelector('.packs-status')!;
    this.saveBtn = this.el.querySelector('[data-act=save]')!;
    this.revertBtn = this.el.querySelector('[data-act=revert]')!;
    this.saveBtn.addEventListener('click', () => void this.save());
    this.revertBtn.addEventListener('click', () => {
      this.packs = savedPacks();
      this.draw();
    });
    // Once a level is picked up on a touch screen, a finger moving it mustn't scroll the page.
    document.addEventListener('touchmove', (ev) => this.drag?.ghost && ev.preventDefault(), { passive: false });
    this.body.addEventListener('pointerdown', (ev) => this.press(ev));
    this.body.addEventListener('contextmenu', (ev) => {
      if ((ev.target as HTMLElement).closest('.pack-tile')) ev.preventDefault();
    });
  }

  /** Take in what this browser worked out before (with today's rating rules). */
  private loadCache() {
    this.cache = this.storage.loadPackCache();
    // Results from other rating versions are dropped.
    let dropped = false;
    for (const [code, c] of Object.entries(this.cache)) {
      if (c.v !== RATING_VERSION || (c.unique && (c.hints === undefined || c.maxArea === undefined))) {
        delete this.cache[code];
        dropped = true;
        continue;
      }
      this.solutions.set(code, { lines: c.segments ? new Set(c.segments) : null, unique: c.unique });
      this.ratings.set(code, c.unique ? { hints: c.hints!, stuck: !!c.stuck, maxArea: c.maxArea!, frames: c.frames ?? [] } : null);
    }
    if (dropped) this.storage.savePackCache(this.cache);
  }

  private remember(code: string, entry: Partial<PackCacheEntry>) {
    this.cache[code] = { ...(this.cache[code] ?? { v: RATING_VERSION, segments: null, unique: false }), ...entry, v: RATING_VERSION };
    clearTimeout(this.cacheTimer);
    this.cacheTimer = window.setTimeout(() => this.storage.savePackCache(this.cache), 500);
  }

  /** Show the view: draw the packs, and solve any levels not solved yet. */
  show(): void {
    this.draw();
    this.solveNew();
  }

  /** Send levels not solved (or being solved) yet to the solver. */
  private solveNew() {
    const todo = this.packs.flatMap((k) => k.levels).filter((c) => !(this.solutions.has(c) && this.ratings.has(c)) && !this.solving.has(c));
    if (!todo.length) return;
    for (const c of todo) this.solving.add(c);
    if (!this.worker) {
      this.worker = new Worker(new URL('./packs.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<PacksMessage>) => {
        const m = ev.data;
        const code = m.code;
        if (m.kind === 'solved') {
          this.solutions.set(code, { lines: m.segments ? new Set(m.segments) : null, unique: m.unique });
          this.remember(code, { segments: m.segments, unique: m.unique });
        } else {
          this.solving.delete(code);
          this.ratings.set(code, m.rating);
          this.remember(code, m.rating ? { hints: m.rating.hints, stuck: m.rating.stuck, maxArea: m.rating.maxArea, frames: m.rating.frames } : {});
        }
        for (const t of this.body.querySelectorAll<HTMLElement>(`.pack-tile[data-code="${code}"]`)) this.drawTile(t);
        this.update();
        if (!this.solving.size) {
          this.worker?.terminate();
          this.worker = null;
        }
      };
    }
    this.worker.postMessage(todo satisfies PacksRequest);
  }

  private get changed(): boolean {
    return (
      this.packs.length !== ALL_PACKS.length ||
      this.packs.some((k, i) => k.from !== i || k.name !== ALL_PACKS[i].name || k.draft !== !!ALL_PACKS[i].draft || k.levels.join() !== ALL_PACKS[i].levels.join())
    );
  }

  /** What's wrong with the edited names or the levels, if anything. */
  private get problem(): string {
    const names = this.packs.map((k) => k.name.trim());
    if (names.some((n) => !n)) return 'Every pack needs a name.';
    if (new Set(names).size !== names.length) return 'Two packs have the same name.';
    if (this.packs.some((k) => !k.draft && !k.levels.length)) return 'Every pack needs a level (a draft may be empty).';
    const wrongKind = this.packs.reduce((n, k) => n + k.levels.filter((c) => isOneShot(decodePuzzle(c)) !== k.oneShot).length, 0);
    if (wrongKind) return `${wrongKind === 1 ? 'A level is' : `${wrongKind} levels are`} in the wrong kind of pack (one-shot or classic).`;
    const shape = this.packs.flatMap((k) => k.levels).filter((c) => shapeProblem(c)).length;
    if (shape) return `${shape === 1 ? 'A level is' : `${shape} levels are`} more than twice as long as wide.`;
    const notUnique = this.packs.flatMap((k) => k.levels).filter((c) => this.solutions.get(c)?.unique === false).length;
    if (notUnique) return `${notUnique === 1 ? 'A level has' : `${notUnique} levels have`} more than one solution, or none.`;
    const repeats = this.repeats().size;
    if (repeats) return `${repeats === 1 ? 'A level has' : `${repeats} levels have`} the same solution path as an earlier one (turned or mirrored).`;
    // Each level's code carries its difficulty, so every level must be rated first.
    const unrated = this.packs.flatMap((k) => k.levels).filter((c) => !this.ratings.get(c)).length;
    if (unrated) return `Working out how hard ${unrated === 1 ? 'a level is' : `${unrated} levels are`}…`;
    return '';
  }

  /**
   * Levels whose solution path is an earlier level's, turned or mirrored: which level that is,
   * keyed by place ("pack:level", both from 0).
   */
  private repeats(): Map<string, string> {
    const first = new Map<string, string>();
    const out = new Map<string, string>();
    this.packs.forEach((k, pi) =>
      k.levels.forEach((code, i) => {
        const lines = this.solutions.get(code)?.lines;
        if (!lines) return;
        const key = pathKey(decodePuzzle(code), lines);
        const earlier = first.get(key);
        if (earlier) out.set(`${pi}:${i}`, earlier);
        else first.set(key, `${k.name} ${i + 1}`);
      }),
    );
    return out;
  }

  /** Classic packs, one-shot packs, then the drafts of each, each group under its heading with a button for a new pack. */
  private draw() {
    const groups = GROUPS.map((g, gi) => {
      const group = el('div', `pack-group${g.draft ? ' drafts' : ''}`);
      const title = el('h2', 'pack-group-title');
      title.textContent = g.title;
      group.append(title);
      if (g.draft) group.append(el('p', 'pack-group-note', 'Work in progress: never shown to players.'));
      this.packs.forEach((k, pi) => {
        if (groupOf(k) === gi) group.append(this.packSection(pi));
      });
      const add = el('button', 'btn pack-new', `${ICONS.plus}<span>${g.add}</span>`);
      add.addEventListener('click', () => this.newPack(g.oneShot, g.draft));
      group.append(add);
      return group;
    });
    this.body.replaceChildren(...groups);
    this.update();
  }

  /** One pack: its name to edit, buttons to move it up or down (among its kind) or delete it, and its levels. */
  private packSection(pi: number): HTMLElement {
    const k = this.packs[pi];
    const section = el('section', 'pack-section');
    // Folding a pack hides its levels (remembered by name).
    const fold = el('button', 'pack-tool pack-fold', ICONS.chevron);
    const setFolded = (on: boolean) => {
      section.classList.toggle('folded', on);
      fold.setAttribute('aria-expanded', String(!on));
      fold.setAttribute('aria-label', on ? 'Show this pack’s levels' : 'Hide this pack’s levels');
      fold.title = fold.getAttribute('aria-label')!;
    };
    setFolded(this.folded.has(k.name));
    fold.addEventListener('click', () => {
      const on = !section.classList.contains('folded');
      on ? this.folded.add(k.name) : this.folded.delete(k.name);
      this.storage.savePacksFolded(this.folded);
      setFolded(on);
    });
    const name = el('input', 'pack-name-input');
    name.value = k.name;
    name.setAttribute('aria-label', 'Pack name');
    name.addEventListener('input', () => {
      // A folded pack stays folded under its new name.
      if (this.folded.delete(k.name)) {
        this.folded.add(name.value);
        this.storage.savePacksFolded(this.folded);
      }
      k.name = name.value;
      this.update();
    });
    // Enter (or Escape) finishes editing the name.
    name.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
      ev.preventDefault();
      name.blur();
    });
    const button = (cls: string, icon: string, label: string, enabled: boolean, run: () => void) => {
      const b = el('button', `pack-tool ${cls}`, icon);
      b.setAttribute('aria-label', label);
      b.title = label;
      b.disabled = !enabled;
      b.addEventListener('click', run);
      return b;
    };
    // Moving stays within the pack's group: one-shot packs always come after the classic ones, and drafts after both.
    const sameKind = (j: number) => !!this.packs[j] && groupOf(this.packs[j]) === groupOf(k);
    const move = (to: number) => () => {
      [this.packs[pi], this.packs[to]] = [this.packs[to], this.packs[pi]];
      this.draw();
    };
    const up = button('pack-up', ICONS.arrowUp, 'Move this pack up', sameKind(pi - 1), move(pi - 1));
    const down = button('pack-down', ICONS.arrowDown, 'Move this pack down', sameKind(pi + 1), move(pi + 1));
    const del = button('pack-delete', ICONS.clear, 'Delete this pack', true, () => this.deletePack(pi));
    // Shows whether players see the pack; tap to switch.
    const draft = el('button', 'pack-tool pack-draft', k.draft ? ICONS.eyeOff : ICONS.eye);
    draft.title = k.draft ? 'Draft, hidden from players: tap to publish' : 'Shown to players: tap to make it a draft';
    draft.setAttribute('aria-label', draft.title);
    draft.addEventListener('click', () => this.setDraft(pi, !k.draft));
    const count = el('span', 'pack-count');
    const head = el('div', 'pack-head');
    head.append(fold, name, draft, up, down, del, count);
    const grid = el('div', 'pack-tiles');
    grid.dataset.pack = String(pi);
    for (const code of k.levels) grid.append(this.tile(code));
    // The end of each pack: a level-shaped outline to add one from the Library.
    const add = el('button', 'pack-add', `${ICONS.plus}<span>Add level</span>`);
    add.addEventListener('click', () => this.openAddSheet(pi));
    grid.append(add);
    section.append(head, grid);
    return section;
  }

  /** Make a pack a draft (hidden from players) or publish it: it moves to the end of its new group. */
  private setDraft(pi: number, draft: boolean) {
    const [k] = this.packs.splice(pi, 1);
    k.draft = draft;
    this.packs.splice(this.groupEnd(k), 0, k);
    this.draw();
  }

  /** Where a pack goes to be last in its group. */
  private groupEnd(k: { oneShot: boolean; draft: boolean }): number {
    return this.packs.filter((j) => groupOf(j) <= groupOf(k)).length;
  }

  /** A new, empty pack at the end of its group, its name ready to type over. */
  private newPack(oneShot: boolean, draft: boolean) {
    const taken = new Set(this.packs.map((k) => k.name.trim()));
    let name = draft ? 'New draft' : 'New pack';
    const base = name;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    const at = this.groupEnd({ oneShot, draft });
    this.packs.splice(at, 0, { name, oneShot, draft, levels: [], from: null });
    this.draw();
    const input = this.body.querySelector<HTMLElement>(`.pack-tiles[data-pack="${at}"]`)?.closest('.pack-section')?.querySelector<HTMLInputElement>('.pack-name-input');
    input?.scrollIntoView({ block: 'center' });
    input?.select();
  }

  /** Take a pack away (asking first if it has levels: they leave src/levels.ts on Save). */
  private deletePack(pi: number) {
    const k = this.packs[pi];
    const n = k.levels.length;
    if (n && !confirm(`Delete the pack "${k.name}"? Its ${n} level${n === 1 ? '' : 's'} leave src/levels.ts when you save.`)) return;
    this.packs.splice(pi, 1);
    this.draw();
  }

  private tile(code: string): HTMLElement {
    const t = el('div', 'pack-tile');
    t.dataset.code = code;
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.onOpen?.(code);
      }
    });
    t.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), el('span', 'pack-tile-label'), el('span', 'pack-tile-rating'));
    // Hovering plays the level's hint journey (the Packs tab is used with a mouse).
    // It stops when the mouse moves off the tile (see playJourney): redrawing the board under
    // the mouse can make the browser report a leave that isn't one.
    t.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType === 'mouse' && !this.drag && this.playing?.tile !== t) this.playJourney(t);
    });
    // Any level can be taken out of its pack (a saved one leaves src/levels.ts on Save).
    const remove = el('button', 'pack-tile-remove', ICONS.close);
    remove.setAttribute('aria-label', 'Remove this level');
    remove.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    remove.addEventListener('click', (ev) => {
      ev.stopPropagation();
      for (const k of this.packs) k.levels = k.levels.filter((c) => c !== code);
      t.remove();
      this.update();
    });
    t.append(remove);
    // A highlight to toggle, for marking benchmarks while ordering.
    const mark = el('button', 'pack-tile-mark');
    mark.setAttribute('aria-label', 'Highlight');
    mark.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    mark.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.marks.has(code) ? this.marks.delete(code) : this.marks.add(code);
      this.storage.savePackMarks(this.marks);
      this.showMark(t);
    });
    t.append(mark);
    this.showMark(t);
    this.drawTile(t);
    return t;
  }

  /** A tile's highlight, as toggled. */
  private showMark(t: HTMLElement) {
    const on = this.marks.has(t.dataset.code!);
    t.classList.toggle('marked', on);
    t.querySelector('.pack-tile-mark')!.setAttribute('aria-pressed', String(on));
  }

  /** A tile's board: solved once its solution is known, plain until then. */
  private drawTile(t: HTMLElement) {
    const p = decodePuzzle(t.dataset.code!);
    const svg = t.querySelector('svg')!;
    svg.classList.add('board');
    const known = this.solutions.get(t.dataset.code!);
    const lines = known?.lines;
    renderBoard(svg, p, { coordinates: false, pad: padFor(p, false, false), segments: lines ?? undefined, solved: !!lines });
    t.classList.toggle('pending', !known);
    t.classList.toggle('bad', known?.unique === false || !!shapeProblem(t.dataset.code!));
  }

  /** Number the tiles, count each pack, and say what's unsaved. */
  private update() {
    const repeats = this.repeats();
    for (const grid of this.body.querySelectorAll<HTMLElement>('.pack-tiles')) {
      const pi = Number(grid.dataset.pack);
      const tiles = [...grid.querySelectorAll<HTMLElement>('.pack-tile')];
      tiles.forEach((t, i) => {
        const p = decodePuzzle(t.dataset.code!);
        const label = t.querySelector('.pack-tile-label')!;
        const code = t.dataset.code!;
        const repeat = repeats.get(`${pi}:${i}`);
        const kind = isOneShot(p) !== this.packs[pi].oneShot ? (isOneShot(p) ? 'one-shot' : 'not a one-shot') : '';
        const bad = kind || shapeProblem(code) || (this.solutions.get(code)?.unique === false ? 'not unique' : repeat ? `same path as ${repeat}` : '');
        label.textContent = `${i + 1} · ${p.w}×${p.h}${bad ? ` · ${bad}` : ''}`;
        t.classList.toggle('bad', !!bad);
        const r = this.ratings.get(code);
        t.querySelector('.pack-tile-rating')!.textContent = r
          ? `${r.hints}${r.stuck ? '+' : ''} hint${r.hints === 1 && !r.stuck ? '' : 's'}`
          : r === null
            ? ''
            : 'counting hints…';
        t.setAttribute('aria-label', `${this.packs[pi].name} ${i + 1}, ${p.w} by ${p.h}`);
        const from = this.packs[pi].from;
        t.classList.toggle('moved', from === null || ALL_PACKS[from].levels[i] !== t.dataset.code);
        t.classList.toggle('added', !ALL_PACKS.some((k) => k.levels.includes(t.dataset.code!)));
      });
      const count = grid.parentElement!.querySelector('.pack-count')!;
      const n = tiles.length;
      count.textContent = `${n} level${n === 1 ? '' : 's'}`;
    }
    const changed = this.changed;
    const problem = this.problem;
    this.saveBtn.disabled = !changed || !!problem;
    this.revertBtn.disabled = !changed;
    this.status.classList.toggle('error', !!problem);
    this.status.textContent = problem
      ? problem
      : changed
        ? `Unsaved changes${this.removed.length ? ` (${this.removed.length} level${this.removed.length === 1 ? '' : 's'} removed)` : ''}. Save writes them to src/levels.ts.`
        : 'Drag a level to move it (hold it first on a touch screen). Click to edit it. Edit names in place.';
  }

  /** Pick a Library puzzle to add to the end of pack `pi`. */
  private openAddSheet(pi: number) {
    // Every Library puzzle is listed. One that can't be a level here is faded, saying why: it's
    // already a level somewhere (the same puzzle, turned, mirrored and so on), it's the wrong
    // kind for the pack (a one-shot in a classic pack, or the other way), it's too long and thin
    // for a level, or it can't be read.
    const inPacks = new Map<string, string>();
    for (const k of this.packs) for (const c of k.levels) inPacks.set(levelKey(decodePuzzle(c)), k.name);
    const entries = this.storage
      .list()
      .map((e) => {
        const code = this.asLevel(e.code);
        if (!code) return { e, code: null, why: 'can’t be read' };
        const taken = inPacks.get(levelKey(decodePuzzle(code)));
        const oneShot = isOneShot(decodePuzzle(code));
        const kind = oneShot === this.packs[pi].oneShot ? '' : oneShot ? 'a one-shot, and this is a classic pack' : 'not a one-shot, and this is a one-shot pack';
        const shape = shapeProblem(code);
        const why = taken ? `already in ${taken}` : kind || shape;
        return { e, code, why };
      })
      .sort((a, b) => b.e.updated - a.e.updated);
    const body = el('div', 'pack-add-sheet');
    const search = el('input', 'text-input');
    search.type = 'search';
    search.placeholder = 'Search your Library';
    search.setAttribute('aria-label', 'Search your Library');
    const list = el('div', 'pack-add-list');
    const empty = el('p', 'pack-add-empty');
    body.append(search, list, empty);
    const sheet = openSheet(`Add to ${this.packs[pi].name}`, body);
    // Each puzzle's solution on its board: solved in the background, the shown ones first.
    const boards = new Map<string, SVGSVGElement[]>();
    const drawBoard = (svg: SVGSVGElement, code: string) => {
      const p = decodePuzzle(code);
      const lines = this.solutions.get(code)?.lines;
      renderBoard(svg, p, { coordinates: false, pad: padFor(p, false, false), segments: lines ?? undefined, solved: !!lines });
    };
    let solver: Worker | null = null;
    const asked = new Set<string>();
    const solveShown = (codes: string[]) => {
      const todo = codes.filter((c) => !this.solutions.has(c) && !asked.has(c));
      if (!todo.length) return;
      for (const c of todo) asked.add(c);
      if (!solver) {
        solver = new Worker(new URL('./packs.worker.ts', import.meta.url), { type: 'module' });
        solver.onmessage = (ev: MessageEvent<PacksMessage>) => {
          const m = ev.data;
          if (m.kind !== 'solved') return;
          this.solutions.set(m.code, { lines: m.segments ? new Set(m.segments) : null, unique: m.unique });
          for (const svg of boards.get(m.code) ?? []) if (svg.isConnected) drawBoard(svg, m.code);
        };
      }
      solver.postMessage({ codes: todo, solveOnly: true } satisfies PacksRequest);
    };
    sheet.dialog.addEventListener('close', () => solver?.terminate());
    const show = () => {
      const q = search.value.trim().toLowerCase();
      const shown = entries.filter(({ e }) => !q || e.name.toLowerCase().includes(q) || (e.collection ?? '').toLowerCase().includes(q));
      empty.textContent = entries.length ? (shown.length ? '' : 'Nothing in your Library matches.') : 'Your Library is empty.';
      const listed = shown;
      boards.clear();
      list.replaceChildren(
        ...listed.map(({ e, code, why }) => {
          const p = code ? decodePuzzle(code) : null;
          const row = el('button', 'pack-add-row');
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.classList.add('board');
          if (code) {
            drawBoard(svg, code);
            boards.set(code, [...(boards.get(code) ?? []), svg]);
          }
          const text = el('span', 'pack-add-text');
          const name = el('span', 'pack-add-name');
          name.textContent = e.name;
          const meta = el('span', 'pack-add-meta');
          meta.textContent = [p ? `${p.w}×${p.h}` : '', e.collection ?? '', why].filter(Boolean).join(' · ');
          text.append(name, meta);
          row.append(svg, text);
          row.disabled = !!why || !code;
          if (why) row.title = `Can’t be added: ${why}.`;
          row.addEventListener('click', () => {
            if (!code) return;
            this.packs[pi].levels.push(code);
            sheet.close();
            this.draw();
            this.solveNew();
            toast(`Added ${e.name} to ${this.packs[pi].name}.`);
            this.body.querySelector(`.pack-tiles[data-pack="${pi}"] .pack-add`)?.scrollIntoView({ block: 'nearest' });
          });
          return row;
        }),
      );
      solveShown(listed.flatMap((x) => (x.code ? [x.code] : [])));
    };
    search.addEventListener('input', show);
    show();
  }

  /**
   * A Library puzzle as a level, just as it was made (the way round, and one-shot or not: a
   * level of the wrong kind for the pack is turned down, not changed). None if it can't be read.
   */
  private asLevel(code: string): string | null {
    try {
      return encodePuzzle(decodePuzzle(code));
    } catch {
      return null;
    }
  }

  /** Work out a level's hint journey for playback, missing from what was kept (if the tile is still being looked at when it's ready, play it). */
  private journeyFor(t: HTMLElement, code: string) {
    this.framesWorker?.terminate();
    const worker = new Worker(new URL('./packs.worker.ts', import.meta.url), { type: 'module' });
    this.framesWorker = worker;
    worker.onmessage = (ev: MessageEvent<PacksMessage>) => {
      const m = ev.data;
      if (m.kind !== 'rated') return;
      worker.terminate();
      if (this.framesWorker === worker) this.framesWorker = null;
      if (!m.rating) return;
      this.ratings.set(code, m.rating);
      this.remember(code, { hints: m.rating.hints, stuck: m.rating.stuck, maxArea: m.rating.maxArea, frames: m.rating.frames });
      if (t.isConnected && t.matches(':hover')) this.playJourney(t);
    };
    worker.postMessage([code] satisfies PacksRequest);
  }

  // --- Dragging ------------------------------------------------------------

  /**
   * Play a tile's hint journey on its board, a step every STEP_MS: the empty board, the easy
   * rules run to the end, a hint (its marks and tiles highlighted), and so on to the solved
   * board; then again from the start.
   */
  private playJourney(t: HTMLElement) {
    this.stopJourney();
    const code = t.dataset.code!;
    const frames = this.ratings.get(code)?.frames;
    if (!frames) return;
    // A kept rating without its replay (from before replays were kept): work it out, then play it.
    if (!frames.length && this.ratings.get(code)?.hints !== undefined) return this.journeyFor(t, code);
    const p = decodePuzzle(code);
    const pad = padFor(p, false, false);
    // A magnified copy beside the tile (on whichever side has room), where the journey plays.
    const zoom = el('div', 'pack-zoom');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('board');
    zoom.append(svg);
    const { width, height } = boardSize(p, pad);
    const scale = Math.min(ZOOM_PX / Math.max(width, height), (window.innerHeight - 32) / height);
    const [zw, zh] = [width * scale, height * scale];
    const r = t.getBoundingClientRect();
    const x = r.right + 12 + zw <= window.innerWidth - 8 ? r.right + 12 : Math.max(8, r.left - 12 - zw);
    const y = Math.min(Math.max(8, r.top + r.height / 2 - zh / 2), window.innerHeight - 8 - zh);
    Object.assign(zoom.style, { left: `${x}px`, top: `${y}px`, width: `${zw}px`, height: `${zh}px` });
    document.body.append(zoom);
    const solution = this.solutions.get(code)?.lines ?? undefined;
    // Hints that get stuck: the replay ends where they do (not on the solution), saying so.
    const stuck = !!this.ratings.get(code)?.stuck;
    const note = el('div', 'pack-zoom-note hidden', 'Hints get stuck here');
    zoom.append(note);
    let i = 0;
    let shown = new Set<number>();
    // Stop once the mouse moves off the tile, or out of the window.
    const moved = (ev: PointerEvent) => {
      if (!(ev.target instanceof Node && t.contains(ev.target))) this.stopJourney();
    };
    const left = (ev: MouseEvent) => {
      if (!ev.relatedTarget) this.stopJourney();
    };
    document.addEventListener('pointermove', moved);
    document.addEventListener('mouseout', left);
    const off = () => {
      document.removeEventListener('pointermove', moved);
      document.removeEventListener('mouseout', left);
      zoom.remove();
    };
    const step = () => {
      let wait = STEP_MS;
      note.classList.toggle('hidden', !(stuck && i > frames.length));
      if (i === 0) {
        renderBoard(svg, p, { coordinates: false, pad });
        shown = new Set();
      } else if (i <= frames.length) {
        const f = frames[i - 1];
        const segments = new Set(f.segments);
        const xMarks = new Set(f.xs);
        const fresh = new Set([...segments, ...xMarks].filter((e) => !shown.has(e)));
        renderBoard(svg, p, {
          coordinates: false,
          pad,
          segments,
          xMarks,
          highlight: fresh,
          focusCells: f.kind === 'hint' ? new Set(f.focus) : undefined,
          faint: f.phantom?.length ? new Set(f.phantom) : undefined,
          errorCells: f.broken?.length ? new Set(f.broken) : undefined,
        });
        shown = new Set([...segments, ...xMarks]);
        if (f.kind === 'hint') wait = HINT_MS;
      } else if (stuck) {
        const f = frames[frames.length - 1];
        renderBoard(svg, p, { coordinates: false, pad, segments: f ? new Set(f.segments) : undefined, xMarks: f ? new Set(f.xs) : undefined });
        wait = 2 * STEP_MS;
      } else {
        renderBoard(svg, p, { coordinates: false, pad, segments: solution, solved: !!solution });
        wait = 2 * STEP_MS;
      }
      i = i > frames.length ? 0 : i + 1;
      this.playing = { tile: t, timer: window.setTimeout(step, wait), off };
    };
    step();
  }

  /** Stop a playing hint journey and take its magnified board away. */
  private stopJourney() {
    if (!this.playing) return;
    window.clearTimeout(this.playing.timer);
    this.playing.off();
    const t = this.playing.tile;
    this.playing = null;
    this.drawTile(t);
  }

  private press(ev: PointerEvent) {
    this.stopJourney();
    const tile = (ev.target as HTMLElement).closest<HTMLElement>('.pack-tile');
    if (!tile || ev.button !== 0 || this.drag) return;
    const r = tile.getBoundingClientRect();
    this.drag = {
      tile,
      ghost: null,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      offX: ev.clientX - r.left,
      offY: ev.clientY - r.top,
      // A mouse picks a level up by moving it; a finger by holding it still first.
      timer: ev.pointerType === 'mouse' ? 0 : window.setTimeout(() => this.pickUp(), HOLD_MS),
    };
    const move = (e: PointerEvent) => e.pointerId === this.drag?.pointerId && this.move(e);
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.drag?.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      this.release(e.type === 'pointerup');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private move(ev: PointerEvent) {
    const d = this.drag!;
    d.x = ev.clientX;
    d.y = ev.clientY;
    const far = Math.hypot(d.x - d.startX, d.y - d.startY) > SLOP;
    if (!d.ghost) {
      if (!far) return;
      // A mouse that moves picks the level up; a finger that moves before the hold is a scroll.
      if (ev.pointerType === 'mouse') this.pickUp();
      else {
        clearTimeout(d.timer);
        this.drag = null;
        return;
      }
    }
    this.follow();
  }

  private pickUp() {
    const d = this.drag;
    if (!d || d.ghost) return;
    const r = d.tile.getBoundingClientRect();
    const ghost = d.tile.cloneNode(true) as HTMLElement;
    ghost.classList.add('pack-ghost');
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.append(ghost);
    d.ghost = ghost;
    d.tile.classList.add('dragging');
    navigator.vibrate?.(10);
    this.follow();
    this.autoScroll();
  }

  /** Move the ghost to the pointer, and the level to where it would drop. */
  private follow() {
    const d = this.drag!;
    d.ghost!.style.transform = `translate(${d.x - d.offX}px, ${d.y - d.offY}px)`;
    const target = this.dropTarget(d.x, d.y);
    if (!target) return;
    const { grid } = target;
    // Levels go before a pack's Add level outline, never after it.
    const before = target.before ?? grid.querySelector('.pack-add');
    if (before === d.tile || (before === d.tile.nextElementSibling && d.tile.parentElement === grid)) return;
    grid.insertBefore(d.tile, before);
  }

  /** Where a level dropped at (x, y) would go: a pack's grid, and the tile it would go before. */
  private dropTarget(x: number, y: number): { grid: HTMLElement; before: Element | null } | null {
    const under = document.elementsFromPoint(x, y);
    const grid = under.map((e) => e.closest<HTMLElement>('.pack-tiles')).find((g) => g) ?? under.map((e) => e.closest('.pack-section')?.querySelector<HTMLElement>('.pack-tiles')).find((g) => g);
    if (!grid) return null;
    // The tile nearest the pointer, in reading order: go before it, or after it when past its middle.
    const tiles = [...grid.querySelectorAll<HTMLElement>('.pack-tile')];
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist < bestDist) [best, bestDist] = [t, dist];
    }
    if (!best) return { grid, before: null };
    const r = best.getBoundingClientRect();
    const after = y > r.bottom || (y >= r.top && x > r.left + r.width / 2);
    return { grid, before: after ? best.nextElementSibling : best };
  }

  /** While a level is held near the top or bottom edge, scroll the view. */
  private autoScroll() {
    cancelAnimationFrame(this.scrollFrame);
    const step = () => {
      const d = this.drag;
      if (!d?.ghost) return;
      const r = this.body.getBoundingClientRect();
      const speed = d.y < r.top + EDGE ? -(r.top + EDGE - d.y) / 4 : d.y > r.bottom - EDGE ? (d.y - (r.bottom - EDGE)) / 4 : 0;
      if (speed) {
        this.body.scrollTop += speed;
        this.follow();
      }
      this.scrollFrame = requestAnimationFrame(step);
    };
    this.scrollFrame = requestAnimationFrame(step);
  }

  private release(up: boolean) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    clearTimeout(d.timer);
    cancelAnimationFrame(this.scrollFrame);
    if (!d.ghost) {
      // A tap (not a drag): open the level in the editor.
      if (up) this.onOpen?.(d.tile.dataset.code!);
      return;
    }
    d.ghost.remove();
    d.tile.classList.remove('dragging');
    for (const g of this.body.querySelectorAll<HTMLElement>('.pack-tiles')) {
      this.packs[Number(g.dataset.pack)].levels = [...g.querySelectorAll<HTMLElement>('.pack-tile')].map((t) => t.dataset.code!);
    }
    this.update();
  }

  // --- Saving --------------------------------------------------------------

  /** Saved levels taken out of every pack. */
  private get removed(): string[] {
    const kept = new Set(this.packs.flatMap((k) => k.levels));
    return ALL_PACKS.flatMap((p) => p.levels).filter((c) => !kept.has(c));
  }

  private async save() {
    const n = this.removed.length;
    if (n && !confirm(`Remove ${n} level${n === 1 ? '' : 's'} from src/levels.ts? Players' progress on ${n === 1 ? 'it' : 'them'} goes too.`)) return;
    this.saveBtn.disabled = true;
    // Each level's code carries its difficulty (as rated now); what's known of it carries over.
    const asSaved = (c: string) => {
      const r = this.ratings.get(c)!;
      const to = encodePuzzle(decodePuzzle(c), difficultyLevel(r));
      if (to !== c) {
        this.solutions.set(to, this.solutions.get(c)!);
        this.ratings.set(to, r);
        if (this.cache[c]) this.remember(to, this.cache[c]);
      }
      return to;
    };
    for (const k of this.packs) k.levels = k.levels.map(asSaved);
    try {
      const res = await fetch('/__packs', {
        method: 'POST',
        body: JSON.stringify({
          packs: this.packs.map((k) => ({ name: k.name.trim(), oneShot: k.oneShot, draft: k.draft, levels: k.levels })),
          was: ALL_PACKS.map((p) => ({ name: p.name, oneShot: !!p.oneShot, draft: !!p.draft, levels: p.levels })),
          page: pageId,
        }),
      });
      const reply = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(reply.error ?? 'Saving failed.');
      // The packs in memory follow the file until Vite reloads the page with it.
      ALL_PACKS.splice(
        0,
        ALL_PACKS.length,
        ...this.packs.map((k) => ({ name: k.name.trim(), ...(k.oneShot ? { oneShot: true } : {}), ...(k.draft ? { draft: true } : {}), levels: [...k.levels] })),
      );
      this.packs = savedPacks();
      this.draw();
      toast('Saved the packs to src/levels.ts.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      this.update();
    }
  }
}
