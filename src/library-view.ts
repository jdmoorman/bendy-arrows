import { decodePuzzle } from './codec';
import { ICONS } from './icons';
import {
  applyTable,
  choicesFor,
  COLUMNS,
  columnByKey,
  DEFAULT_TABLE_STATE,
  filterActive,
  libraryRows,
  NAME_COLUMN,
  type Column,
  type Filter,
  type LibRow,
  type Rating,
  type TableState,
} from './library-table';
import type { Puzzle } from './model';
import type { Progress } from './play';
import type { RatingMessage } from './rating.worker';
import { newId, type Storage } from './storage';
import { exportText, parseImport } from './library-io';
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
      // Drop filters saved with the old "All except" mode: read as Only they'd mean the opposite.
      filters: Object.fromEntries(Object.entries(saved.filters && typeof saved.filters === 'object' ? saved.filters : {}).filter(([, f]) => !(f as { exclude?: boolean } | null)?.exclude)),
      sort: saved.sort && columnByKey(saved.sort.key) ? saved.sort : null,
      columns: Array.isArray(saved.columns) ? saved.columns.filter((k) => columnByKey(k)) : DEFAULT_TABLE_STATE.columns,
    };
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
    this.filterBtn.addEventListener('click', () => this.openFilters(this.hiddenColumns(), 'Filters for hidden columns'));
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
      // The puzzles become a set named after the file, to filter by in the Collection column.
      if (f) this.importText(await f.text(), f.name.replace(/\.[^.]*$/, '').trim() || 'Imported');
    });
    const imp = el('button', 'btn', `${ICONS.library}<span>Import</span>`);
    imp.title = 'Add the puzzles from a text file of links';
    imp.addEventListener('click', () => file.click());
    row.append(exp, imp, file);
    return row;
  }

  private importText(text: string, collection: string) {
    const { puzzles, bad } = parseImport(text);
    const have = new Map(this.storage.list().map((e) => [e.code, e]));
    let added = 0;
    let tagged = 0;
    let failed = false;
    const now = Date.now();
    for (const { code, name } of puzzles) {
      const existing = have.get(code);
      if (existing) {
        // Already saved: it joins the set too, unless it came in with another one.
        if (!existing.collection && this.storage.put({ ...existing, collection })) {
          have.set(code, { ...existing, collection });
          tagged++;
        }
        continue;
      }
      const entry = { id: newId(), name: name ?? defaultName(decodePuzzle(code)), code, created: now + added, updated: now + added, collection };
      have.set(code, entry);
      if (!this.storage.put(entry)) {
        failed = true;
        break;
      }
      added++;
    }
    const skipped = puzzles.length - added;
    const parts = [`Imported ${added} puzzle${added === 1 ? '' : 's'}`];
    if (skipped && !failed) parts.push(`${skipped} already saved${tagged ? ` (${tagged} added to the set)` : ''}`);
    if (bad) parts.push(`${bad} line${bad === 1 ? '' : 's'} not understood`);
    if (failed) parts.push('storage is full');
    toast(`${parts.join(', ')}.${added || tagged ? ` Collection: “${collection}”.` : ''}`, failed || (!added && bad > 0) ? 'error' : '');
    if (added || tagged) {
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

  private visibleColumns(): Column[] {
    return COLUMNS.filter((c) => this.state.columns.includes(c.key));
  }

  private renderTable() {
    const shown = applyTable(this.rows, this.state);
    const active = Object.values(this.state.filters).filter(filterActive).length;
    // The Filters button holds the filters of hidden columns (shown ones filter from their header).
    const hiddenCols = this.hiddenColumns();
    const hiddenActive = hiddenCols.filter((c) => filterActive(this.state.filters[c.key])).length;
    this.filterBtn.innerHTML = `<span>Filters${hiddenActive ? ` (${hiddenActive})` : ''}</span>`;
    this.filterBtn.title = 'Filters for columns that are hidden';
    this.filterBtn.classList.toggle('active', hiddenActive > 0);
    this.filterBtn.hidden = hiddenCols.length === 0;
    const narrowed = active > 0 || this.state.search.trim() !== '';
    this.count.replaceChildren(`${shown.length === this.rows.length ? 'All' : `${shown.length} of`} ${this.rows.length} puzzles`);
    const hidden = this.storage.loadHiddenSamples().length;
    if (hidden) {
      const restore = el('button', 'link-btn', `Restore ${hidden} deleted sample${hidden === 1 ? '' : 's'}`);
      restore.addEventListener('click', () => {
        this.storage.saveHiddenSamples([]);
        this.refresh();
      });
      this.count.append(' · ', restore);
    }
    if (narrowed) {
      const clear = el('button', 'link-btn', 'Clear search and filters');
      clear.addEventListener('click', () => {
        this.state.filters = {};
        this.state.search = '';
        this.search.value = '';
        this.changed();
      });
      this.count.append(' · ', clear);
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
        const fb = el('button', `lib-filter-btn${on ? ' active' : ''}`, ICONS.filter);
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
      const open = el('button', 'lib-open');
      const title = el('span');
      title.textContent = r.name;
      open.append(title);
      if (r.status === 'Solved') open.append(el('span', 'lib-check', ICONS.check));
      open.setAttribute('aria-label', `Play ${r.name}`);
      open.addEventListener('click', () => this.open(r, 'play'));
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
      const edit = el('button', 'btn icon', ICONS.edit);
      edit.setAttribute('aria-label', `Edit ${r.name}`);
      edit.addEventListener('click', () => this.open(r, 'edit'));
      actions.append(edit);
      const del = el('button', 'btn icon', ICONS.clear);
      del.setAttribute('aria-label', `Delete ${r.name}`);
      del.addEventListener('click', () => {
        if (r.entry) {
          const entry = r.entry;
          if (!confirm(`Delete “${entry.name}”?`)) return;
          this.storage.remove(entry.id);
          this.onDeleted?.(entry.id);
        } else {
          // Samples are built in: deleting one hides it on this device.
          if (!confirm(`Delete the sample “${r.name}” from your library? You can bring deleted samples back later.`)) return;
          this.storage.saveHiddenSamples([...this.storage.loadHiddenSamples(), r.code]);
        }
        this.refresh();
      });
      // Official levels can't be deleted; your puzzles and the archived samples can.
      if (!r.key.startsWith('level:')) actions.append(del);
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

  private open(r: LibRow, tab: 'play' | 'edit') {
    const saved = r.entry ?? this.storage.findByCode(r.code);
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
      if (!columns.length) body.append(el('p', 'field-label', 'Every column is showing: filter from the column headers.'));
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
          const lo = values.length ? Math.min(...values) : 0;
          const hi = values.length ? Math.max(...values) : 0;
          const range = el('div', 'range-row');
          const input = (which: 'min' | 'max') => {
            const i = el('input', 'text-input') as HTMLInputElement;
            i.type = 'number';
            i.inputMode = 'numeric';
            i.placeholder = String(which === 'min' ? lo : hi);
            i.setAttribute('aria-label', `${c.label} ${which === 'min' ? 'at least' : 'at most'}`);
            if (f[which] !== undefined) i.value = String(f[which]);
            i.addEventListener('input', () => {
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

  /** Work out the difficulty and uniqueness of saved puzzles that haven't been rated. */
  private rateMissing() {
    const codes = [...new Set(this.rows.filter((r) => r.entry && r.difficulty === undefined).map((r) => r.code))].filter((c) => !this.requested.has(c));
    if (!codes.length) return;
    for (const c of codes) this.requested.add(c);
    if (!this.worker) {
      this.worker = new Worker(new URL('./rating.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<RatingMessage>) => {
        const { code, rating } = ev.data;
        this.ratings[code] = rating;
        this.storage.saveRating(code, rating);
        for (const r of this.rows) {
          if (r.code === code) {
            r.difficulty = rating.difficulty;
            r.unique = rating.unique;
          }
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
