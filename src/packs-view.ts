import { decodePuzzle, encodePuzzle } from './codec';
import { MIN_PACK_LEVELS, PACK_SIZE_STEP, PACKS } from './levels';
import type { PackRating, PacksMessage, PacksRequest } from './packs.worker';
import { orientTail, pathKey, tailLeftLow, transformPuzzle } from './model';
import { boardSize, padFor, renderBoard } from './render';
import type { Storage } from './storage';
import { ICONS } from './icons';
import { el, openSheet, toast } from './ui';

/** Why a level's shape can't be a level (phones are held upright), or '' if it's fine. */
function shapeProblem(code: string): string {
  const p = decodePuzzle(code);
  return p.w > p.h ? 'wider than tall' : p.h > 2 * p.w ? 'too tall' : !tailLeftLow(p) ? 'tail not low on the left' : '';
}

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
 * tap one to edit it. Each pack's name can be edited too, puzzles from the
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
  /** Each pack's levels, in the order shown. */
  private order: string[][] = PACKS.map((p) => [...p.levels]);
  /** Each pack's name, as edited. */
  private names: string[] = PACKS.map((p) => p.name);
  /** Each level's solution once solved (none if it has none), and whether it's the only one. */
  private solutions = new Map<string, { lines: Set<number> | null; unique: boolean }>();
  /** Hint steps, worked out after the solutions (null if not unique). */
  private ratings = new Map<string, PackRating | null>();
  /** Levels sent to the solver and not back yet. */
  private solving = new Set<string>();
  /** Highlighted levels, kept in this browser: for marking benchmarks while ordering. */
  private marks: Set<string>;
  /** The tile whose hint journey is playing (while the mouse is over it), and its next step. */
  private playing: { tile: HTMLElement; timer: number; off: () => void } | null = null;
  private worker: Worker | null = null;
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
      this.order = PACKS.map((p) => [...p.levels]);
      this.names = PACKS.map((p) => p.name);
      this.draw();
    });
    // Once a level is picked up on a touch screen, a finger moving it mustn't scroll the page.
    document.addEventListener('touchmove', (ev) => this.drag?.ghost && ev.preventDefault(), { passive: false });
    this.body.addEventListener('pointerdown', (ev) => this.press(ev));
    this.body.addEventListener('contextmenu', (ev) => {
      if ((ev.target as HTMLElement).closest('.pack-tile')) ev.preventDefault();
    });
  }

  /** Show the view: draw the packs, and solve any levels not solved yet. */
  show(): void {
    this.draw();
    this.solveNew();
  }

  /** Send levels not solved (or being solved) yet to the solver. */
  private solveNew() {
    const todo = this.order.flat().filter((c) => !this.solutions.has(c) && !this.solving.has(c));
    if (!todo.length) return;
    for (const c of todo) this.solving.add(c);
    if (!this.worker) {
      this.worker = new Worker(new URL('./packs.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<PacksMessage>) => {
        const m = ev.data;
        const code = m.code;
        if (m.kind === 'solved') this.solutions.set(code, { lines: m.segments ? new Set(m.segments) : null, unique: m.unique });
        else {
          this.solving.delete(code);
          this.ratings.set(code, m.rating);
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
    return PACKS.some((p, i) => this.order[i].join() !== p.levels.join() || this.names[i] !== p.name);
  }

  /** What's wrong with the edited names or the levels, if anything. */
  private get problem(): string {
    const names = this.names.map((n) => n.trim());
    if (names.some((n) => !n)) return 'Every pack needs a name.';
    if (new Set(names).size !== names.length) return 'Two packs have the same name.';
    const shape = this.order.flat().filter((c) => shapeProblem(c)).length;
    if (shape) return `${shape === 1 ? 'A level is' : `${shape} levels are`} wider than tall, more than twice as tall as wide, or with a tail that could be turned onto the left edge or lower.`;
    const notUnique = this.order.flat().filter((c) => this.solutions.get(c)?.unique === false).length;
    if (notUnique) return `${notUnique === 1 ? 'A level has' : `${notUnique} levels have`} more than one solution, or none.`;
    const repeats = this.repeats().size;
    if (repeats) return `${repeats === 1 ? 'A level has' : `${repeats} levels have`} the same solution path as an earlier one (turned or mirrored).`;
    return '';
  }

  /** Levels whose solution path is an earlier level's, turned or mirrored: which level that is. */
  private repeats(): Map<string, string> {
    const first = new Map<string, string>();
    const out = new Map<string, string>();
    this.order.forEach((levels, pi) =>
      levels.forEach((code, i) => {
        const lines = this.solutions.get(code)?.lines;
        if (!lines) return;
        const key = pathKey(decodePuzzle(code), lines);
        const earlier = first.get(key);
        if (earlier) out.set(code, earlier);
        else first.set(key, `${this.names[pi]} ${i + 1}`);
      }),
    );
    return out;
  }

  private draw() {
    this.body.replaceChildren(
      ...PACKS.map((_, pi) => {
        const section = el('section', 'pack-section');
        const name = el('input', 'pack-name-input');
        name.value = this.names[pi];
        name.setAttribute('aria-label', 'Pack name');
        name.addEventListener('input', () => {
          this.names[pi] = name.value;
          this.update();
        });
        const count = el('span', 'pack-count');
        const head = el('div', 'pack-head');
        head.append(name, count);
        const grid = el('div', 'pack-tiles');
        grid.dataset.pack = String(pi);
        for (const code of this.order[pi]) grid.append(this.tile(code));
        // The end of each pack: a level-shaped outline to add one from the Library.
        const add = el('button', 'pack-add', `${ICONS.plus}<span>Add level</span>`);
        add.addEventListener('click', () => this.openAddSheet(pi));
        grid.append(add);
        section.append(head, grid);
        return section;
      }),
    );
    this.update();
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
      this.order = this.order.map((levels) => levels.filter((c) => c !== code));
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
    renderBoard(svg, p, { pad: padFor(p), segments: lines ?? undefined, solved: !!lines });
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
        const repeat = repeats.get(code);
        const bad = shapeProblem(code) || (this.solutions.get(code)?.unique === false ? 'not unique' : repeat ? `same path as ${repeat}` : '');
        label.textContent = `${i + 1} · ${p.w}×${p.h}${bad ? ` · ${bad}` : ''}`;
        t.classList.toggle('bad', !!bad);
        const r = this.ratings.get(code);
        t.querySelector('.pack-tile-rating')!.textContent = r
          ? `${r.hints}${r.stuck ? '+' : ''} hint${r.hints === 1 && !r.stuck ? '' : 's'}`
          : r === null
            ? ''
            : 'counting hints…';
        t.setAttribute('aria-label', `${this.names[pi]} ${i + 1}, ${p.w} by ${p.h}`);
        t.classList.toggle('moved', PACKS[pi].levels[i] !== t.dataset.code);
        t.classList.toggle('added', !PACKS.some((k) => k.levels.includes(t.dataset.code!)));
      });
      const count = grid.parentElement!.querySelector('.pack-count')!;
      const n = tiles.length;
      // Packs aim for a multiple of PACK_SIZE_STEP levels (a soft target: Save still works).
      const lo = n - (n % PACK_SIZE_STEP);
      const aim = n % PACK_SIZE_STEP ? ` · aim for ${[lo, lo + PACK_SIZE_STEP].filter((x) => x >= MIN_PACK_LEVELS).join(' or ')}` : '';
      count.textContent = `${n} level${n === 1 ? '' : 's'}${n < MIN_PACK_LEVELS ? ` · needs ${MIN_PACK_LEVELS}` : aim}`;
      count.classList.toggle('short', n < MIN_PACK_LEVELS);
      count.classList.toggle('off-target', n >= MIN_PACK_LEVELS && !!aim);
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
    const inPacks = new Set(this.order.flat());
    const entries = this.storage
      .list()
      .map((e) => ({ e, code: this.asLevel(e.code, pi) }))
      .filter((x): x is { e: (typeof x)['e']; code: string } => !!x.code && !inPacks.has(x.code) && !shapeProblem(x.code))
      .sort((a, b) => b.e.updated - a.e.updated);
    const body = el('div', 'pack-add-sheet');
    const search = el('input', 'text-input');
    search.type = 'search';
    search.placeholder = 'Search your Library';
    search.setAttribute('aria-label', 'Search your Library');
    const list = el('div', 'pack-add-list');
    const empty = el('p', 'pack-add-empty');
    body.append(search, list, empty);
    const sheet = openSheet(`Add to ${this.names[pi]}`, body);
    const show = () => {
      const q = search.value.trim().toLowerCase();
      const shown = entries.filter(({ e }) => !q || e.name.toLowerCase().includes(q) || (e.collection ?? '').toLowerCase().includes(q));
      empty.textContent = entries.length
        ? shown.length
          ? ''
          : 'Nothing in your Library matches.'
        : 'Nothing in your Library can be added: everything is already in a pack, or more than twice as long one way as the other.';
      list.replaceChildren(
        ...shown.slice(0, 200).map(({ e, code }) => {
          const p = decodePuzzle(code);
          const row = el('button', 'pack-add-row');
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.classList.add('board');
          renderBoard(svg, p, { pad: padFor(p) });
          const text = el('span', 'pack-add-text');
          const name = el('span', 'pack-add-name');
          name.textContent = e.name;
          const meta = el('span', 'pack-add-meta');
          meta.textContent = `${p.w}×${p.h}${e.collection ? ` · ${e.collection}` : ''}`;
          text.append(name, meta);
          row.append(svg, text);
          row.addEventListener('click', () => {
            this.order[pi].push(code);
            sheet.close();
            this.draw();
            this.solveNew();
            toast(`Added ${e.name} to ${this.names[pi]}.`);
            this.body.querySelector(`.pack-tiles[data-pack="${pi}"] .pack-add`)?.scrollIntoView({ block: 'nearest' });
          });
          return row;
        }),
      );
    };
    search.addEventListener('input', show);
    show();
  }

  /**
   * A Library puzzle as a level of pack `pi`: turned upright if it's wider than tall, then
   * turned or mirrored so its tail is low on the left, and a
   * one-shot exactly when the pack is a one-shot pack. None if it can't be read.
   */
  private asLevel(code: string, pi: number): string | null {
    try {
      let p = decodePuzzle(code);
      if (p.w > p.h) p = transformPuzzle(p, 'rotateRight');
      p = orientTail(p);
      if (PACKS[pi].oneShot) p.oneShot = true;
      else delete p.oneShot;
      return encodePuzzle(p);
    } catch {
      return null;
    }
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
    const p = decodePuzzle(code);
    const pad = padFor(p);
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
      if (i === 0) {
        renderBoard(svg, p, { pad });
        shown = new Set();
      } else if (i <= frames.length) {
        const f = frames[i - 1];
        const segments = new Set(f.segments);
        const xMarks = new Set(f.xs);
        const fresh = new Set([...segments, ...xMarks].filter((e) => !shown.has(e)));
        renderBoard(svg, p, { pad, segments, xMarks, highlight: fresh, focusCells: f.kind === 'hint' ? new Set(f.focus) : undefined });
        shown = new Set([...segments, ...xMarks]);
        if (f.kind === 'hint') wait = HINT_MS;
      } else {
        renderBoard(svg, p, { pad, segments: solution, solved: !!solution });
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
    this.order = [...this.body.querySelectorAll<HTMLElement>('.pack-tiles')].map((g) => [...g.querySelectorAll<HTMLElement>('.pack-tile')].map((t) => t.dataset.code!));
    this.update();
  }

  // --- Saving --------------------------------------------------------------

  /** Saved levels taken out of every pack. */
  private get removed(): string[] {
    const kept = new Set(this.order.flat());
    return PACKS.flatMap((p) => p.levels).filter((c) => !kept.has(c));
  }

  private async save() {
    const n = this.removed.length;
    if (n && !confirm(`Remove ${n} level${n === 1 ? '' : 's'} from src/levels.ts? Players' progress on ${n === 1 ? 'it' : 'them'} goes too.`)) return;
    this.saveBtn.disabled = true;
    try {
      const res = await fetch('/__packs', {
        method: 'POST',
        body: JSON.stringify({
          packs: PACKS.map((p, i) => ({ name: p.name, newName: this.names[i].trim(), levels: this.order[i], was: p.levels })),
        }),
      });
      const reply = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(reply.error ?? 'Saving failed.');
      // The packs in memory follow the file until Vite reloads the page with it.
      PACKS.forEach((p, i) => {
        p.levels = [...this.order[i]];
        p.name = this.names[i] = this.names[i].trim();
      });
      this.update();
      toast('Saved the packs to src/levels.ts.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      this.update();
    }
  }
}
