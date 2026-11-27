import { decodePuzzle } from './codec';
import { ICONS } from './icons';
import { COLLECTIONS, libraryRows, needsRating, type LibRow, type Rating } from './library-table';
import type { Puzzle } from './model';
import type { Progress } from './play';
import type { RatingMessage } from './rating.worker';
import { padFor, renderBoard } from './render';
import { newId, type LibraryEntry, type Storage } from './storage';
import { exportText, parseImport } from './library-io';
import { defaultName } from './save-ui';
import { el, openSheet, toast } from './ui';

export interface OpenRequest {
  puzzle: Puzzle;
  progress?: Progress;
  id?: string;
}

/** Today's date (local time) as YYYY-MM-DD, for export file names. */
function dateKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The two sections, classic puzzles first. */
const SECTIONS = [
  { oneShot: false, title: 'Classic' },
  { oneShot: true, title: 'One-shot' },
];

/**
 * The Library tab: your saved puzzles (never the shipped levels, unless you made one and added it
 * to a pack) as cards, like the Packs tab's, in two sections: classic and one-shot. Tap a card to
 * play, edit or delete it.
 */
export class LibraryView {
  readonly el: HTMLElement;
  onOpen?: (req: OpenRequest, tab: 'play' | 'edit') => void;
  /** Save whatever puzzle is current. */
  onSave?: () => void;
  /** Called after a saved puzzle is deleted. */
  onDeleted?: (id: string) => void;
  /** Share code of the puzzle being played, to mark its card. */
  currentCode = '';

  private ratings: Record<string, Rating>;
  private rows: LibRow[] = [];
  private worker: Worker | null = null;
  private requested = new Set<string>();
  private body: HTMLElement;

  constructor(private storage: Storage) {
    this.ratings = storage.loadRatings();
    this.el = el('div', 'view library-view hidden');
    const top = el('div', 'lib-top');
    const save = el('button', 'btn', `${ICONS.save}<span>Save current</span>`);
    save.addEventListener('click', () => this.onSave?.());
    top.append(save);
    this.body = el('div', 'lib-body');
    this.el.append(top, this.body);
  }

  // --- Export and import ------------------------------------------------------

  /** Buttons to move every saved puzzle to or from a text file of links. */
  private transferRow(): HTMLElement {
    const row = el('div', 'lib-transfer');
    const exp = el('button', 'btn', `${ICONS.share}<span>Export saved</span>`);
    exp.addEventListener('click', () => {
      const entries = this.storage.list();
      if (!entries.length) return toast('No saved puzzles to export yet.');
      downloadText(`bendy-arrows-puzzles-${dateKey()}.txt`, exportText(entries, location.href));
      toast(`Exported ${entries.length} puzzle${entries.length === 1 ? '' : 's'}.`);
    });
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = '.txt,text/plain';
    file.hidden = true;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      // The puzzles become a collection, named by you (the file's name to start with).
      if (f) this.openImportSheet(await f.text(), f.name.replace(/\.[^.]*$/, '').trim() || 'Imported');
    });
    const imp = el('button', 'btn', `${ICONS.library}<span>Import</span>`);
    imp.title = 'Add the puzzles from a text file of links';
    imp.addEventListener('click', () => file.click());
    row.append(exp, imp, file);
    return row;
  }

  /** Ask what to call the collection the file's puzzles go into, then import them. */
  private openImportSheet(text: string, suggested: string) {
    const { puzzles, bad } = parseImport(text);
    if (!puzzles.length) {
      toast(bad ? `No puzzles found: ${bad} line${bad === 1 ? '' : 's'} not understood.` : 'No puzzles found in that file.', 'error');
      return;
    }
    const body = el('form', 'sheet-stack lib-import');
    const label = el('label', 'field-label', 'Collection name');
    const name = el('input', 'text-input') as HTMLInputElement;
    name.value = suggested;
    name.required = true;
    name.setAttribute('aria-label', 'Collection name');
    // An existing collection's name adds the puzzles to it.
    const sets = [...new Set(this.storage.list().flatMap((e) => (e.collection ? [e.collection] : [])))].sort((a, b) => a.localeCompare(b));
    const list = el('datalist');
    list.id = `import-sets-${Date.now()}`;
    for (const s of sets) list.append(Object.assign(el('option'), { value: s }));
    name.setAttribute('list', list.id);
    label.append(name, list);
    const note = el('p', 'lib-import-note', `${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'} to import${sets.length ? '; use an existing collection’s name to add them to it' : ''}.`);
    const go = el('button', 'btn primary', '<span>Import</span>');
    go.type = 'submit';
    const check = () => {
      const n = name.value.trim();
      const reserved = n === COLLECTIONS.yours;
      go.disabled = !n || reserved;
      note.classList.toggle('error', reserved);
      if (reserved) note.textContent = `“${n}” is taken: pick another name.`;
      else note.textContent = `${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'} to import${sets.includes(n) ? `, added to the collection “${n}”` : sets.length ? '; use an existing collection’s name to add them to it' : ''}.`;
    };
    name.addEventListener('input', check);
    check();
    body.append(label, note, go);
    const sheet = openSheet('Import puzzles', body);
    body.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (go.disabled) return;
      sheet.close();
      this.importText(text, name.value.trim());
    });
    name.focus();
    name.select();
  }

  /**
   * Add the puzzles to the collection, as new copies even if you have them elsewhere (you may
   * have lost track of those); only a puzzle the collection already holds is skipped.
   */
  private importText(text: string, collection: string) {
    const { puzzles, bad } = parseImport(text);
    const inSet = new Set(this.storage.list().filter((e) => e.collection === collection).map((e) => e.code));
    let added = 0;
    let failed = false;
    const now = Date.now();
    for (const { code, name } of puzzles) {
      if (inSet.has(code)) continue;
      const entry: LibraryEntry = { id: newId(), name: name ?? defaultName(decodePuzzle(code)), code, created: now + added, updated: now + added, collection };
      if (!this.storage.put(entry)) {
        failed = true;
        break;
      }
      inSet.add(code);
      added++;
    }
    const skipped = puzzles.length - added;
    const parts = [`Imported ${added} puzzle${added === 1 ? '' : 's'}`];
    if (skipped && !failed) parts.push(`${skipped} already in this collection`);
    if (bad) parts.push(`${bad} line${bad === 1 ? '' : 's'} not understood`);
    if (failed) parts.push('storage is full');
    toast(`${parts.join(', ')}.${added ? ` Collection: “${collection}”.` : ''}`, failed || (!added && bad > 0) ? 'error' : '');
    if (added) this.refresh();
  }

  /** Re-read the library and redraw (call when the tab is shown). */
  refresh(): void {
    this.rows = libraryRows(this.storage, this.ratings);
    this.draw();
    this.rateMissing();
  }

  // --- Cards ------------------------------------------------------------------

  /** The two sections of cards, then export and import. */
  private draw() {
    const sections = SECTIONS.map(({ oneShot, title }) => {
      const rows = this.rows.filter((r) => r.oneShot === oneShot);
      const section = el('section', 'pack-group lib-section');
      const head = el('h2', 'pack-group-title');
      head.textContent = title;
      const count = el('span', 'lib-section-count', `${rows.length}`);
      head.append(' ', count);
      section.append(head);
      if (rows.length) {
        const grid = el('div', 'pack-tiles lib-cards');
        for (const r of rows) grid.append(this.card(r));
        section.append(grid);
      } else {
        section.append(el('p', 'pack-group-note', oneShot ? 'No one-shots saved yet.' : 'No classic puzzles saved yet.'));
      }
      return section;
    });
    this.body.replaceChildren(...sections, this.transferRow());
  }

  /** A puzzle's card: its board, name, size and hints, and the pack it's in. */
  private card(r: LibRow): HTMLElement {
    const t = el('button', 'pack-tile lib-card');
    t.dataset.code = r.code;
    if (r.code === this.currentCode) t.classList.add('current');
    if (r.solved) t.classList.add('solved');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('board');
    // The solution once worked out, or (not unique) the lines the hints get to.
    const solution = r.segments ? new Set(r.segments) : undefined;
    const lines = solution ?? (r.reach?.segments.length ? new Set(r.reach.segments) : undefined);
    const faint = !solution && r.reach?.faint?.length ? new Set(r.reach.faint) : undefined;
    renderBoard(svg, r.puzzle, { coordinates: false, pad: padFor(r.puzzle, false, false), segments: lines, faint, solved: !!solution });
    // Its size, with a check once solved.
    const size = el('span', 'lib-card-size', `${r.puzzle.w}×${r.puzzle.h}`);
    if (r.solved) size.prepend(el('span', 'lib-check', ICONS.check));
    const count = (n: number, stuck?: boolean) => `${n}${stuck ? '+' : ''} hint${n === 1 && !stuck ? '' : 's'}`;
    t.append(svg, size);
    if (r.unique === false) {
      // How far the hints get (the lines on the board), then that it isn't unique.
      if (r.reach) t.append(el('span', 'pack-tile-label', count(r.reach.hints)));
      t.append(el('span', 'pack-tile-label lib-nonunique', 'nonunique'));
    } else if (typeof r.hints === 'number') t.append(el('span', 'pack-tile-label', count(r.hints, r.hintsStuck)));
    if (r.pack) {
      const pack = el('span', 'lib-card-pack');
      pack.textContent = r.pack;
      t.append(pack);
    }
    t.setAttribute('aria-label', `${r.oneShot ? 'One-shot' : 'Classic'} puzzle, ${r.puzzle.w} by ${r.puzzle.h}${r.unique === false ? ', more than one solution' : ''}${r.solved ? ', solved' : ''}${r.pack ? `, in ${r.pack}` : ''}`);
    t.addEventListener('click', () => this.openCard(r));
    return t;
  }

  /** A card tapped: play it, edit it, or delete it. */
  private openCard(r: LibRow) {
    const body = el('div', 'sheet-stack lib-card-sheet');
    const meta = [r.entry.collection, r.pack ? `In the pack ${r.pack}` : ''].filter(Boolean).join(' · ');
    if (meta) body.append(el('p', 'field-label', meta));
    const row = el('div', 'lib-card-actions');
    const play = el('button', 'btn primary', `${ICONS.play}<span>Play</span>`);
    const edit = el('button', 'btn', `${ICONS.edit}<span>Edit</span>`);
    const del = el('button', 'btn', `${ICONS.clear}<span>Delete</span>`);
    row.append(play, edit, del);
    body.append(row);
    const sheet = openSheet(`${r.oneShot ? 'One-shot' : 'Classic'} ${r.puzzle.w}×${r.puzzle.h}`, body);
    const open = (tab: 'play' | 'edit') => {
      sheet.close();
      const e = r.entry;
      this.onOpen?.({ puzzle: decodePuzzle(r.code), progress: e.progress, id: e.id }, tab);
    };
    play.addEventListener('click', () => open('play'));
    edit.addEventListener('click', () => open('edit'));
    del.addEventListener('click', () => {
      if (!confirm(`Delete this puzzle?${r.pack ? ` It stays a level in ${r.pack}.` : ''}`)) return;
      sheet.close();
      this.storage.remove(r.entry.id);
      this.onDeleted?.(r.entry.id);
      this.refresh();
    });
  }

  // --- Background ratings ---------------------------------------------------

  /** Work out the uniqueness, solution and hint steps of puzzles that haven't been rated. */
  private rateMissing() {
    const codes = [...new Set(this.rows.filter((r) => needsRating(this.ratings[r.code])).map((r) => r.code))].filter((c) => !this.requested.has(c));
    if (!codes.length) return;
    for (const c of codes) this.requested.add(c);
    if (!this.worker) {
      this.worker = new Worker(new URL('./rating.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<RatingMessage>) => {
        const { code, rating } = ev.data;
        this.ratings[code] = rating;
        this.storage.saveRating(code, rating);
        for (const r of this.rows) {
          if (r.code !== code) continue;
          r.unique = rating.unique;
          r.hints = rating.hints;
          r.hintsStuck = rating.hintsStuck;
          r.segments = rating.segments;
          r.reach = rating.reach;
          for (const t of this.body.querySelectorAll<HTMLElement>(`.lib-card[data-code="${code}"]`)) t.replaceWith(this.card(r));
        }
      };
    }
    this.worker.postMessage(codes);
  }
}

function downloadText(filename: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
