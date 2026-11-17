import { decodePuzzle, encodePuzzle } from './codec';
import { dailyName, dailyOptions, dateKey } from './daily';
import { generateInBackground } from './generator-client';
import { ICONS } from './icons';
import {
  applyTable,
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
import type { Storage } from './storage';
import { el, openSheet } from './ui';

export interface OpenRequest {
  puzzle: Puzzle;
  progress?: Progress;
  id?: string;
  name?: string;
}

/** The Library tab: the daily puzzle, and every puzzle in a table you can sort and filter. */
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
  private dailyBox: HTMLElement;
  private renderQueued = false;

  constructor(private storage: Storage) {
    const saved = storage.loadLibraryTable() ?? {};
    this.state = {
      search: typeof saved.search === 'string' ? saved.search : '',
      filters: saved.filters && typeof saved.filters === 'object' ? saved.filters : {},
      sort: saved.sort && columnByKey(saved.sort.key) ? saved.sort : null,
      columns: Array.isArray(saved.columns) ? saved.columns.filter((k) => columnByKey(k)) : DEFAULT_TABLE_STATE.columns,
    };
    this.ratings = storage.loadRatings();

    this.el = el('div', 'view library-view hidden');
    this.dailyBox = el('div', 'lib-top');
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
    this.filterBtn.addEventListener('click', () => this.openFilters());
    const colBtn = el('button', 'btn icon-only', ICONS.list);
    colBtn.setAttribute('aria-label', 'Choose columns');
    colBtn.title = 'Choose columns';
    colBtn.addEventListener('click', () => this.openColumns());
    controls.append(this.search, this.filterBtn, colBtn);
    this.count = el('p', 'lib-count');
    const wrap = el('div', 'lib-table-wrap');
    this.table = el('table', 'lib-table');
    wrap.append(this.table);
    this.el.append(this.dailyBox, controls, this.count, wrap);
  }

  /** Re-read the library and redraw (call when the tab is shown). */
  refresh(): void {
    this.rows = libraryRows(this.storage, this.ratings);
    this.renderDaily();
    this.renderTable();
    this.rateMissing();
  }

  // --- Daily puzzle and save ------------------------------------------------

  private renderDaily() {
    const date = dateKey();
    const code = this.storage.loadDaily(date);
    const solved = code ? this.storage.loadTimes(code).length || (this.storage.findByCode(code)?.solved ? 1 : 0) : 0;
    const daily = el('button', `lib-daily${solved ? ' solved' : ''}`);
    const title = el('span', 'lib-name');
    title.textContent = dailyName(date);
    const meta = el('span', 'lib-meta', solved ? `${ICONS.check} Solved${solved > 1 ? ` ${solved}×` : ''}` : 'A new puzzle every day');
    daily.append(title, meta);
    daily.addEventListener('click', async () => {
      const open = (code: string) => {
        const saved = this.storage.findByCode(code);
        this.onOpen?.({ puzzle: decodePuzzle(code), progress: saved?.progress, id: saved?.id, name: saved?.name ?? dailyName(date) }, 'play');
      };
      const cached = this.storage.loadDaily(date);
      if (cached) return open(cached);
      daily.disabled = true;
      meta.innerHTML = '<span class="spinner" aria-hidden="true"></span> Making today’s puzzle…';
      try {
        const { puzzle } = await generateInBackground(dailyOptions(date)).result;
        const made = encodePuzzle(puzzle);
        this.storage.saveDaily(date, made);
        open(made);
      } catch {
        daily.disabled = false;
        meta.textContent = 'Couldn’t make today’s puzzle. Tap to try again.';
      }
    });
    const save = el('button', 'btn', `${ICONS.save}<span>Save current</span>`);
    save.addEventListener('click', () => this.onSave?.());
    this.dailyBox.replaceChildren(daily, save);
  }

  // --- Table ----------------------------------------------------------------

  private changed() {
    this.storage.saveLibraryTable(this.state);
    this.renderTable();
  }

  private visibleColumns(): Column[] {
    return COLUMNS.filter((c) => this.state.columns.includes(c.key));
  }

  private renderTable() {
    const shown = applyTable(this.rows, this.state);
    const active = Object.values(this.state.filters).filter(filterActive).length;
    this.filterBtn.innerHTML = `<span>Filters${active ? ` (${active})` : ''}</span>`;
    this.filterBtn.classList.toggle('active', active > 0);
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
    }

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
      head.append(th);
    }
    head.append(el('th', 'lib-actions-head'));
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const r of shown) {
      const tr = el('tr');
      if (r.code === this.currentCode) tr.classList.add('current');
      if (r.solves) tr.classList.add('solved');
      const name = el('th', 'lib-name-cell');
      name.scope = 'row';
      const open = el('button', 'lib-open');
      const title = el('span');
      title.textContent = r.name;
      open.append(title);
      if (r.solves) open.append(el('span', 'lib-check', `${ICONS.check}${r.solves > 1 ? `${r.solves}×` : ''}`));
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
      if (r.entry) {
        const entry = r.entry;
        const del = el('button', 'btn icon', ICONS.clear);
        del.setAttribute('aria-label', `Delete ${r.name}`);
        del.addEventListener('click', () => {
          if (!confirm(`Delete “${entry.name}”?`)) return;
          this.storage.remove(entry.id);
          this.onDeleted?.(entry.id);
          this.refresh();
        });
        actions.append(del);
      }
      tr.append(actions);
      tbody.append(tr);
    }
    if (!shown.length) {
      const tr = el('tr');
      const td = el('td', 'lib-empty', 'No puzzles match.');
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

  private openFilters() {
    const body = el('div', 'sheet-stack lib-filters');
    openSheet('Filters', body);
    const draw = () => {
      body.replaceChildren();
      const clear = el('button', 'btn', '<span>Clear all filters</span>');
      clear.disabled = !Object.values(this.state.filters).some(filterActive);
      clear.addEventListener('click', () => {
        this.state.filters = {};
        this.changed();
        draw();
      });
      body.append(clear);
      for (const c of COLUMNS) {
        const field = el('div', 'lib-filter');
        field.append(el('p', 'field-label', c.label));
        if (c.kind === 'choice') {
          const f = this.state.filters[c.key];
          const chosen = f && 'values' in f ? f.values : [];
          const chips = el('div', 'chip-row');
          for (const v of c.choices ?? []) {
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
              clear.disabled = !Object.values(this.state.filters).some(filterActive);
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

  private openColumns() {
    const body = el('div', 'sheet-stack');
    openSheet('Columns', body);
    const draw = () => {
      body.replaceChildren();
      const reset = el('button', 'btn', '<span>Back to the usual columns</span>');
      reset.addEventListener('click', () => {
        this.state.columns = [...DEFAULT_TABLE_STATE.columns];
        this.changed();
        draw();
      });
      body.append(reset);
      for (const c of COLUMNS) {
        const row = el('label', 'switch-row');
        row.append(el('span', 'switch-text', c.label));
        const input = el('input', 'switch') as HTMLInputElement;
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.checked = this.state.columns.includes(c.key);
        input.addEventListener('change', () => {
          // Keep the columns in their usual order.
          const on = new Set(this.state.columns);
          if (input.checked) on.add(c.key);
          else on.delete(c.key);
          this.state.columns = COLUMNS.map((x) => x.key).filter((k) => on.has(k));
          this.changed();
        });
        row.append(input);
        body.append(row);
      }
    };
    draw();
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
