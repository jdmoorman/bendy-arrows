import { PACKS } from './levels';
import { decodePuzzle } from './codec';
import { ICONS } from './icons';
import {
  COLLECTIONS,
  applyTable,
  choicesFor,
  COLUMNS,
  columnByKey,
  DEFAULT_TABLE_STATE,
  filterActive,
  libraryRows,
  NAME_COLUMN,
  RATING_VERSION,
  type Column,
  type Filter,
  type LibRow,
  type Rating,
  type TableState,
} from './library-table';
import type { Puzzle } from './model';
import type { Progress } from './play';
import type { RatingMessage } from './rating.worker';
import { newId, type LibraryEntry, type Storage } from './storage';
import { exportText, packText, parseImport } from './library-io';
import { defaultName } from './save-ui';
import { el, openSheet, toast } from './ui';

export interface OpenRequest {
  puzzle: Puzzle;
  progress?: Progress;
  id?: string;
  name?: string;
}

/** Today's date (local time) as YYYY-MM-DD, for export file names. */
function dateKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Library tab: every puzzle in a table you can sort and filter. */
export class LibraryView {
  readonly el: HTMLElement;
  onOpen?: (req: OpenRequest, tab: 'play' | 'edit') => void;
  /** Save whatever puzzle is current. */
  onSave?: () => void;
  /** Called after a saved puzzle is deleted. */
  onDeleted?: (id: string) => void;
  /** Share code of the puzzle being played, to mark its row. */
  currentCode = '';

  private state: TableState;
  private ratings: Record<string, Rating>;
  private rows: LibRow[] = [];
  private worker: Worker | null = null;
  private requested = new Set<string>();
  private table: HTMLTableElement;
  private count: HTMLElement;
  private filterBtn: HTMLButtonElement;
  private search: HTMLInputElement;
  private columnsRow: HTMLElement;
  private renderQueued = false;

  constructor(private storage: Storage) {
    const saved = storage.loadLibraryTable() ?? {};
    this.state = {
      search: typeof saved.search === 'string' ? saved.search : '',
      // Drop filters saved with the old "All except" mode (read as Only they'd mean the opposite)
      // and filters on columns that are gone.
      filters: Object.fromEntries(Object.entries(saved.filters && typeof saved.filters === 'object' ? saved.filters : {}).filter(([k, f]) => columnByKey(k) && !(f as { exclude?: boolean } | null)?.exclude)),
      sort: saved.sort && columnByKey(saved.sort.key) ? saved.sort : null,
      columns: Array.isArray(saved.columns) ? saved.columns.filter((k) => columnByKey(k)) : DEFAULT_TABLE_STATE.columns,
    };
    // Packs used to be collections of their own: a Collection filter naming packs becomes
    // Level packs, with those packs chosen in the Pack filter.
    const cf = this.state.filters.collection;
    if (cf && 'values' in cf) {
      const packs = cf.values.filter((v) => PACKS.some((p) => p.name === v));
      if (packs.length) {
        this.state.filters.collection = { values: [...new Set([...cf.values.filter((v) => !packs.includes(v)), COLLECTIONS.levels])] };
        this.state.filters.pack = { values: packs };
      }
    }
    this.ratings = storage.loadRatings();

    this.el = el('div', 'view library-view hidden');
    const top = el('div', 'lib-top');
    const save = el('button', 'btn', `${ICONS.save}<span>Save current</span>`);
    save.addEventListener('click', () => this.onSave?.());
    top.append(save);
    const controls = el('div', 'lib-controls');
    this.search = el('input', 'text-input lib-search') as HTMLInputElement;
    this.search.type = 'search';
    this.search.placeholder = 'Search names';
    this.search.setAttribute('aria-label', 'Search names');
    this.search.value = this.state.search;
    this.search.addEventListener('input', () => {
      this.state.search = this.search.value;
      this.changed();
    });
    this.filterBtn = el('button', 'btn', '');
    // Columns are filtered from their headers. A filter left on a column that's since been hidden
    // still applies, so this button (shown only then) lists those filters to change or clear.
    this.filterBtn.addEventListener('click', () => this.openFilters(this.hiddenFiltered(), 'Filters on hidden columns'));
    controls.append(this.search, this.filterBtn);
    this.count = el('p', 'lib-count');
    // One toggle per column, in a row that scrolls sideways, just above the table.
    this.columnsRow = el('div', 'chip-row lib-columns');
    this.columnsRow.setAttribute('role', 'group');
    this.columnsRow.setAttribute('aria-label', 'Columns to show');
    const wrap = el('div', 'lib-table-wrap');
    this.table = el('table', 'lib-table');
    wrap.append(this.table);
    this.el.append(top, controls, this.count, this.columnsRow, wrap, this.transferRow());
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
      const reserved = n === COLLECTIONS.yours || n === COLLECTIONS.levels;
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
    if (added) {
      // A Collection filter that leaves the set out would hide what was just imported: add it.
      const f = this.state.filters.collection;
      if (f && 'values' in f && f.values.length && !f.values.includes(collection)) {
        this.state.filters.collection = { values: [...f.values, collection] };
        this.storage.saveLibraryTable(this.state);
      }
      this.refresh();
    }
  }

  /** Re-read the library and redraw (call when the tab is shown). */
  refresh(): void {
    this.rows = libraryRows(this.storage, this.ratings);
    this.renderTable();
    this.rateMissing();
  }

  // --- Table ----------------------------------------------------------------

  private changed() {
    this.storage.saveLibraryTable(this.state);
    this.renderTable();
  }

  private hiddenColumns(): Column[] {
    return COLUMNS.filter((c) => !this.state.columns.includes(c.key));
  }

  /** Hidden columns that still have a filter on. */
  private hiddenFiltered(): Column[] {
    return this.hiddenColumns().filter((c) => filterActive(this.state.filters[c.key]));
  }

  private visibleColumns(): Column[] {
    return COLUMNS.filter((c) => this.state.columns.includes(c.key));
  }

  private renderTable() {
    const shown = applyTable(this.rows, this.state);
    const active = Object.values(this.state.filters).filter(filterActive).length;
    // The Filters button holds the filters of hidden columns (shown ones filter from their header).
    const hiddenActive = this.hiddenFiltered().length;
    this.filterBtn.innerHTML = `<span>Hidden filters (${hiddenActive})</span>`;
    this.filterBtn.title = 'Filters still on columns that are hidden';
    this.filterBtn.classList.toggle('active', hiddenActive > 0);
    this.filterBtn.classList.toggle('hidden', hiddenActive === 0);
    const narrowed = active > 0 || this.state.search.trim() !== '';
    this.count.replaceChildren(`${shown.length === this.rows.length ? 'All' : `${shown.length} of`} ${this.rows.length} puzzles`);
    if (narrowed) {
      const clear = el('button', 'link-btn', 'Clear search and filters');
      clear.addEventListener('click', () => {
        this.state.filters = {};
        this.state.search = '';
        this.search.value = '';
        this.changed();
      });
      this.count.append(' · ', clear);
      // Export everything the search and filters leave, in the table's order, as a level pack.
      if (shown.length) {
        const exp = el('button', 'link-btn', `Export ${shown.length} shown`);
        exp.addEventListener('click', () => {
          // Named after the one pack or collection shown, if there's just one.
          const sets = [...new Set(shown.map((r) => r.pack ?? r.collection))];
          const base = sets.length === 1 ? sets[0].replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() : 'bendy-arrows-pack';
          downloadText(`${base || 'bendy-arrows-pack'}-${dateKey()}.txt`, packText(shown, location.href));
          toast(`Exported ${shown.length} puzzle${shown.length === 1 ? '' : 's'}.`);
        });
        this.count.append(' · ', exp);
      }
      // Delete everything the search and filters leave, e.g. one imported Collection.
      const entries = shown.flatMap((r) => (r.entry ? [r.entry] : []));
      if (entries.length) {
        const n = entries.length;
        const delAll = el('button', 'link-btn', `Delete ${n} shown`);
        delAll.addEventListener('click', () => {
          const sets = [...new Set(entries.map((e) => e.collection).filter(Boolean))];
          const from = sets.length === 1 ? ` from “${sets[0]}”` : '';
          if (!confirm(`Delete the ${n} saved puzzle${n === 1 ? '' : 's'}${from} shown? This can't be undone.`)) return;
          this.storage.removeMany(entries.map((e) => e.id));
          for (const e of entries) this.onDeleted?.(e.id);
          toast(`Deleted ${n} puzzle${n === 1 ? '' : 's'}.`);
          this.refresh();
        });
        this.count.append(' · ', delAll);
      }
    }

    this.renderColumnToggles();
    const cols = this.visibleColumns();
    const head = el('tr');
    for (const c of [NAME_COLUMN, ...cols]) {
      const th = el('th', c.kind === 'number' ? 'num' : '');
      const btn = el('button', 'lib-sort');
      const sorted = this.state.sort?.key === c.key ? this.state.sort.dir : 0;
      btn.innerHTML = `<span>${c.short ?? c.label}</span>${sorted ? `<span aria-hidden="true">${sorted === 1 ? '▲' : '▼'}</span>` : ''}`;
      btn.title = `Sort by ${c.label.toLowerCase()}`;
      th.setAttribute('aria-sort', sorted === 1 ? 'ascending' : sorted === -1 ? 'descending' : 'none');
      // Tap once to sort up, again to sort down, a third time to stop sorting.
      btn.addEventListener('click', () => {
        this.state.sort = sorted === 0 ? { key: c.key, dir: 1 } : sorted === 1 ? { key: c.key, dir: -1 } : null;
        this.changed();
      });
      th.append(btn);
      if (c !== NAME_COLUMN) {
        // Each column's filter sits in its header.
        const on = filterActive(this.state.filters[c.key]);
        const fb = el('button', `lib-filter-btn${on ? ' active' : ''}`, on ? ICONS.filterOn : ICONS.filter);
        fb.setAttribute('aria-label', `Filter by ${c.label.toLowerCase()}${on ? ' (on)' : ''}`);
        fb.title = `Filter by ${c.label.toLowerCase()}`;
        fb.addEventListener('click', () => this.openFilters([c], c.label));
        th.append(fb);
      }
      head.append(th);
    }
    head.append(el('th', 'lib-actions-head'));
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const r of shown) {
      const tr = el('tr');
      if (r.code === this.currentCode) tr.classList.add('current');
      if (r.status === 'Solved') tr.classList.add('solved');
      const name = el('th', 'lib-name-cell');
      name.scope = 'row';
      // Real links, so the browser offers Open in new tab (right-click, long press, Cmd-click);
      // a plain click opens here, as before.
      const open = el('a', 'lib-open') as HTMLAnchorElement;
      open.href = `#p=${r.code}`;
      const title = el('span');
      title.textContent = r.name;
      open.append(title);
      if (r.status === 'Solved') open.append(el('span', 'lib-check', ICONS.check));
      open.setAttribute('aria-label', `Play ${r.name}`);
      open.addEventListener('click', (ev) => this.followHere(ev, () => this.open(r, 'play')));
      name.append(open);
      tr.append(name);
      for (const c of cols) {
        const td = el('td', c.kind === 'number' ? 'num' : '');
        const text = c.show ? c.show(r) : String(c.value(r) ?? '');
        td.textContent = text;
        if (c.key === 'symmetric' && r.symmetric) td.classList.add('lib-sym');
        tr.append(td);
      }
      const actions = el('td', 'lib-actions');
      const edit = el('a', 'btn icon', ICONS.edit) as HTMLAnchorElement;
      edit.href = `#p=${r.code}&edit`;
      edit.setAttribute('aria-label', `Edit ${r.name}`);
      edit.addEventListener('click', (ev) => this.followHere(ev, () => this.open(r, 'edit')));
      actions.append(edit);
      const del = el('button', 'btn icon', ICONS.clear);
      del.setAttribute('aria-label', `Delete ${r.name}`);
      del.addEventListener('click', () => {
        const entry = r.entry!;
        if (!confirm(`Delete “${entry.name}”?`)) return;
        this.storage.remove(entry.id);
        this.onDeleted?.(entry.id);
        this.refresh();
      });
      // Official levels can't be deleted; your puzzles can.
      if (r.entry) actions.append(del);
      tr.append(actions);
      tbody.append(tr);
    }
    if (!shown.length) {
      const tr = el('tr');
      const td = el('td', 'lib-empty', this.rows.length ? 'No puzzles match.' : 'Nothing here yet. Save a puzzle, or import some.');
      td.colSpan = cols.length + 2;
      tr.append(td);
      tbody.append(tr);
    }
    this.table.replaceChildren(thead, tbody);
  }

  /** A plain click on a puzzle link opens it here; with Cmd, Ctrl, Shift or Alt the browser handles it (a new tab or window). */
  private followHere(ev: MouseEvent, openHere: () => void) {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    openHere();
  }

  private open(r: LibRow, tab: 'play' | 'edit') {
    // A pack level opens on its own, not linked to a saved copy that happens to share its code
    // (e.g. the puzzle it was exported from): saving then makes a separate Library copy.
    const saved = r.entry ?? (r.key.startsWith('level:') ? undefined : this.storage.findByCode(r.code));
    this.onOpen?.({ puzzle: decodePuzzle(r.code), progress: saved?.progress, id: saved?.id, name: saved?.name ?? r.name }, tab);
  }

  // --- Filters and columns -------------------------------------------------

  /** A sheet with the filters of these columns (one column from its header, or the hidden ones). */
  private openFilters(columns: Column[], title: string) {
    const body = el('div', 'sheet-stack lib-filters');
    openSheet(title, body);
    const anyOn = () => columns.some((c) => filterActive(this.state.filters[c.key]));
    const draw = () => {
      body.replaceChildren();
      const clear = el('button', 'btn', `<span>${columns.length === 1 ? 'Clear filter' : 'Clear these filters'}</span>`);
      clear.disabled = !anyOn();
      clear.addEventListener('click', () => {
        for (const c of columns) delete this.state.filters[c.key];
        this.changed();
        draw();
      });
      body.append(clear);
      if (!columns.length) body.append(el('p', 'field-label', 'No filters left on hidden columns: filter from the column headers.'));
      for (const c of columns) {
        const field = el('div', 'lib-filter');
        if (columns.length > 1) field.append(el('p', 'field-label', c.label));
        if (c.kind === 'choice') {
          const f = this.state.filters[c.key];
          const chosen = f && 'values' in f ? f.values : [];
          const chips = el('div', 'chip-row');
          for (const v of choicesFor(c, this.rows)) {
            const chip = el('button', 'chip');
            chip.type = 'button';
            chip.textContent = v;
            chip.setAttribute('aria-pressed', String(chosen.includes(v)));
            chip.addEventListener('click', () => {
              const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
              this.setFilter(c.key, { values: next });
              draw();
            });
            chips.append(chip);
          }
          field.append(chips);
        } else {
          const f = (this.state.filters[c.key] ?? {}) as { min?: number; max?: number };
          const values = this.rows.map((r) => c.value(r)).filter((v): v is number => typeof v === 'number');
          const hi = values.length ? Math.max(...values) : 0;
          const range = el('div', 'range-row');
          const input = (which: 'min' | 'max') => {
            const i = el('input', 'text-input') as HTMLInputElement;
            i.type = 'number';
            i.inputMode = 'numeric';
            // The lower bound starts its hint at 0; the upper one at the largest value there is.
            i.placeholder = String(which === 'min' ? 0 : hi);
            i.setAttribute('aria-label', `${c.label} ${which === 'min' ? 'at least' : 'at most'}`);
            if (f[which] !== undefined) i.value = String(f[which]);
            let wasEmpty = i.value === '';
            i.addEventListener('input', (ev) => {
              // The arrows step an empty field from 0; step from the faint number shown instead.
              // (Typing reports an inputType; a step doesn't.)
              if (wasEmpty && i.value !== '' && !(ev as InputEvent).inputType) {
                i.value = String(Number(i.placeholder) + Math.sign(Number(i.value)));
              }
              wasEmpty = i.value === '';
              const n = i.value.trim() === '' ? undefined : Number(i.value);
              const cur = (this.state.filters[c.key] ?? {}) as { min?: number; max?: number };
              this.setFilter(c.key, { ...cur, [which]: Number.isFinite(n) ? n : undefined });
              clear.disabled = !anyOn();
            });
            return i;
          };
          range.append(input('min'), el('span', '', 'to'), input('max'));
          field.append(range);
        }
        body.append(field);
      }
    };
    draw();
  }

  private setFilter(key: string, f: Filter) {
    if (filterActive(f)) this.state.filters[key] = f;
    else delete this.state.filters[key];
    this.changed();
  }

  /** The column toggles: tap one to show or hide that column. */
  private renderColumnToggles() {
    const chips = COLUMNS.map((c) => {
      const on = this.state.columns.includes(c.key);
      const chip = el('button', 'chip', c.short ?? c.label);
      chip.type = 'button';
      chip.title = c.label;
      chip.setAttribute('aria-pressed', String(on));
      chip.addEventListener('click', () => {
        // Keep the columns in their usual order.
        const shown = new Set(this.state.columns);
        if (on) shown.delete(c.key);
        else shown.add(c.key);
        this.state.columns = COLUMNS.map((x) => x.key).filter((k) => shown.has(k));
        this.changed();
      });
      return chip;
    });
    const usual = DEFAULT_TABLE_STATE.columns;
    if (this.state.columns.length !== usual.length || this.state.columns.some((k) => !usual.includes(k))) {
      const reset = el('button', 'link-btn', 'Usual columns');
      reset.addEventListener('click', () => {
        this.state.columns = [...usual];
        this.changed();
      });
      chips.push(reset);
    }
    const scroll = this.columnsRow.scrollLeft;
    this.columnsRow.replaceChildren(...chips);
    this.columnsRow.scrollLeft = scroll;
  }


  // --- Background ratings ---------------------------------------------------

  /** Work out the uniqueness, hint steps and search metrics of puzzles that haven't been rated. */
  private rateMissing() {
    const codes = [...new Set(this.rows.filter((r) => this.ratings[r.code]?.v !== RATING_VERSION).map((r) => r.code))].filter((c) => !this.requested.has(c));
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
          r.hints = rating.hints;
          r.hintsStuck = rating.hintsStuck;
          r.tightest = rating.tightest;
          r.effort = rating.effort;
          r.unique = rating.unique;
        }
        this.queueRender();
      };
    }
    this.worker.postMessage(codes);
  }

  /** Redraw once for a burst of results. */
  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderTable();
    });
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
