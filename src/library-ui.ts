import { decodePuzzle, encodePuzzle } from './codec';
import { ICONS } from './icons';
import { dailyName, dailyOptions, dateKey } from './daily';
import { generateInBackground } from './generator-client';
import { modeOf, openCells, type Puzzle } from './model';
import type { Progress } from './play';
import { SAMPLES } from './samples';
import { symmetryOf } from './symmetry';
import { newId, type LibraryEntry, type Storage } from './storage';
import { el, openSheet, toast } from './ui';

export interface LibraryContext {
  storage: Storage;
  /** Puzzle the user would save (the editor's puzzle on the Create tab). */
  current: Puzzle;
  progress?: Progress;
  solved?: boolean;
  /** Library entry the current puzzle was opened from, if any. */
  currentId?: string;
  onOpen(entry: { puzzle: Puzzle; progress?: Progress; id?: string; name?: string }, tab: 'play' | 'edit'): void;
  onSaved(entry: LibraryEntry): void;
}

export function defaultName(p: Puzzle): string {
  return `${modeOf(p) === 'cycle' ? 'Loop' : 'Path'} ${p.w}×${p.h}`;
}

function describe(p: Puzzle): string {
  const kind = modeOf(p) === 'cycle' ? 'Loop' : p.checkpoints.length ? 'Numbers' : 'Path';
  return `${kind} · ${p.w}×${p.h} · ${openCells(p).length} tiles`;
}

/**
 * How many times a puzzle has been solved, from the recorded solve times (or
 * 1 if the library entry is marked solved from before times were kept).
 */
function solveCount(storage: Storage, code: string, solvedFlag = false): number {
  return storage.loadTimes(code).length || (solvedFlag ? 1 : 0);
}

/** Highlight a solved puzzle's row and add a check mark (with "10×" for repeat solves). */
function markSolved(li: HTMLElement, main: HTMLElement, n: number): void {
  if (!n) return;
  li.classList.add('solved');
  const badge = el('span', 'lib-solved', `${ICONS.check}${n > 1 ? `<span>${n}×</span>` : ''}`);
  badge.setAttribute('aria-label', n > 1 ? `Solved ${n} times` : 'Solved');
  main.after(badge);
}

/** A note on symmetric puzzles. */
function symmetryNote(p: Puzzle): string {
  return symmetryOf(p) ? ' · <span class="lib-sym">Symmetric</span>' : '';
}

export function openLibrarySheet(ctx: LibraryContext): void {
  const { storage } = ctx;
  const body = el('div', 'sheet-stack');
  const sheet = openSheet('Library', body);
  const code = encodePuzzle(ctx.current);

  // Your own puzzles start open; the sample sections start folded.
  const openFolds = new Set(storage.loadLibraryFolds() ?? ['saved']);

  const render = () => {
    body.replaceChildren();
    const existing = ctx.currentId ? storage.get(ctx.currentId) : undefined;

    // --- Save form ---
    const nameInput = el('input', 'text-input') as HTMLInputElement;
    nameInput.value = existing?.name ?? defaultName(ctx.current);
    nameInput.setAttribute('aria-label', 'Puzzle name');
    nameInput.maxLength = 60;
    const saveRow = el('div', 'sheet-row');
    const save = (asNew: boolean) => {
      const name = nameInput.value.trim() || defaultName(ctx.current);
      const now = Date.now();
      const keepProgress = !asNew && existing?.code === code;
      const entry: LibraryEntry = {
        id: asNew || !existing ? newId() : existing.id,
        name,
        code,
        created: asNew || !existing ? now : existing.created,
        updated: now,
        progress: ctx.progress ?? (keepProgress ? existing?.progress : undefined),
        solved: ctx.solved ?? (keepProgress ? existing?.solved : false),
      };
      if (!storage.put(entry)) {
        toast('Could not save — browser storage is unavailable', 'error');
        return;
      }
      ctx.currentId = entry.id;
      ctx.onSaved(entry);
      toast(`Saved “${name}”`);
      render();
    };
    const saveBtn = el('button', 'btn primary', `${ICONS.save}<span>${existing ? 'Update' : 'Save'}</span>`);
    saveBtn.addEventListener('click', () => save(false));
    saveRow.append(saveBtn);
    if (existing) {
      const asNewBtn = el('button', 'btn', '<span>Save as new</span>');
      asNewBtn.addEventListener('click', () => save(true));
      saveRow.append(asNewBtn);
    }
    nameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save(false);
    });
    body.append(el('p', 'field-label', existing ? 'This puzzle is saved as' : 'Save this puzzle'), nameInput, saveRow);
    if (!storage.available) body.append(el('p', 'field-label', 'Browser storage is unavailable, so saving is disabled.'));

    /**
     * A collapsible section; its header says how many puzzles it holds and how
     * many are solved. Which sections are open is remembered.
     */
    function fold(key: string, title: string, items: (readonly [string, boolean | undefined])[]): HTMLElement {
      const d = el('details', 'lib-fold');
      d.open = openFolds.has(key);
      const solved = items.filter(([code, flag]) => solveCount(storage, code, flag) > 0).length;
      const count = `${items.length} puzzle${items.length === 1 ? '' : 's'}${solved ? ` · ${solved} solved` : ''}`;
      d.append(el('summary', '', `<span>${title}</span><span class="lib-meta">${count}</span>`));
      d.addEventListener('toggle', () => {
        if (d.open) openFolds.add(key);
        else openFolds.delete(key);
        storage.saveLibraryFolds([...openFolds]);
      });
      body.append(d);
      return d;
    }

    // --- Daily puzzle ---
    body.append(el('hr', 'sheet-sep'), el('p', 'field-label', 'Daily puzzle'));
    const date = dateKey();
    const daily = el('ul', 'lib-list');
    const dailyLi = el('li', 'lib-item');
    const dailyBtn = el('button', 'lib-main');
    const dailyTitle = el('span', 'lib-name');
    dailyTitle.textContent = dailyName(date);
    const dailyCode = storage.loadDaily(date);
    const dailySaved = dailyCode ? storage.findByCode(dailyCode) : undefined;
    const dailyMeta = el('span', 'lib-meta', 'A new puzzle every day');
    dailyBtn.append(dailyTitle, dailyMeta);
    dailyBtn.addEventListener('click', async () => {
      const open = (code: string) => {
        const saved = storage.findByCode(code);
        sheet.close();
        ctx.onOpen({ puzzle: decodePuzzle(code), progress: saved?.progress, id: saved?.id, name: saved?.name ?? dailyName(date) }, 'play');
      };
      const cached = storage.loadDaily(date);
      if (cached) return open(cached);
      dailyBtn.disabled = true;
      dailyMeta.innerHTML = '<span class="spinner" aria-hidden="true"></span> Making today’s puzzle…';
      try {
        const { puzzle } = await generateInBackground(dailyOptions(date)).result;
        const code = encodePuzzle(puzzle);
        storage.saveDaily(date, code);
        open(code);
      } catch {
        dailyBtn.disabled = false;
        dailyMeta.textContent = 'Couldn’t make today’s puzzle. Tap to try again.';
      }
    });
    dailyLi.append(dailyBtn);
    if (dailyCode) markSolved(dailyLi, dailyBtn, solveCount(storage, dailyCode, dailySaved?.solved));
    daily.append(dailyLi);
    body.append(daily);

    // --- Saved puzzles ---
    const entries = storage.list();
    const savedFold = fold('saved', 'Your puzzles', entries.map((e) => [e.code, e.solved] as const));
    if (!entries.length) savedFold.append(el('p', 'empty-note', 'Nothing saved yet.'));
    const list = el('ul', 'lib-list');
    for (const e of entries) {
      let p: Puzzle;
      try {
        p = decodePuzzle(e.code);
      } catch {
        continue;
      }
      const li = el('li', 'lib-item');
      if (e.id === ctx.currentId) li.classList.add('current');
      const main = el('button', 'lib-main');
      const title = el('span', 'lib-name');
      title.textContent = e.name;
      const solves = solveCount(storage, e.code, e.solved);
      const state = solves ? '' : e.progress?.segments.length ? ' · In progress' : ' · New';
      main.append(title, el('span', 'lib-meta', `${describe(p)}${symmetryNote(p)}${state}`));
      main.addEventListener('click', () => {
        sheet.close();
        ctx.onOpen({ puzzle: p, progress: e.progress, id: e.id, name: e.name }, 'play');
      });
      const editBtn = el('button', 'btn icon', ICONS.edit);
      editBtn.setAttribute('aria-label', `Edit ${e.name}`);
      editBtn.addEventListener('click', () => {
        sheet.close();
        ctx.onOpen({ puzzle: p, progress: e.progress, id: e.id, name: e.name }, 'edit');
      });
      const delBtn = el('button', 'btn icon', ICONS.clear);
      delBtn.setAttribute('aria-label', `Delete ${e.name}`);
      delBtn.addEventListener('click', () => {
        if (!confirm(`Delete “${e.name}”?`)) return;
        storage.remove(e.id);
        if (ctx.currentId === e.id) ctx.currentId = undefined;
        render();
      });
      li.append(main, editBtn, delBtn);
      markSolved(li, main, solves);
      list.append(li);
    }
    savedFold.append(list);

    // --- Samples, grouped by difficulty, then special collections ---
    const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' } as const;
    const sections: [string, typeof SAMPLES][] = [
      ...(['easy', 'medium', 'hard', 'veryhard'] as const).map(
        (level) => [`${LEVEL_NAMES[level]} samples`, SAMPLES.filter((x) => !x.group && x.level === level)] as [string, typeof SAMPLES],
      ),
      ['Sparse: one obstacle or none', SAMPLES.filter((x) => x.group === 'one')],
      ['Sparse: fewest obstacles by size', SAMPLES.filter((x) => x.group === 'fewest')],
      ['Sparse: hard with few obstacles', SAMPLES.filter((x) => x.group === 'hardsparse')],
    ];
    for (const [heading, list] of sections) {
      const key = heading;
      const section = fold(key, heading, list.map((x) => [x.code, false] as const));
      const samples = el('ul', 'lib-list');
      for (const s of list) {
        const p = decodePuzzle(s.code);
        const li = el('li', 'lib-item');
        const main = el('button', 'lib-main');
        const title = el('span', 'lib-name');
        title.textContent = s.name;
        const saved = storage.findByCode(s.code);
        const solves = solveCount(storage, s.code, saved?.solved);
        const state = !solves && saved?.progress?.segments.length ? ' · In progress' : '';
        // The name already says the type and size.
        const level = s.group ? ` · ${LEVEL_NAMES[s.level]}` : '';
        main.append(title, el('span', 'lib-meta', `${openCells(p).length} tiles${level}${symmetryNote(p)}${state}`));
        main.addEventListener('click', () => {
          sheet.close();
          ctx.onOpen({ puzzle: p, progress: saved?.progress, id: saved?.id, name: saved?.name ?? s.name }, 'play');
        });
        li.append(main);
        markSolved(li, main, solves);
        samples.append(li);
      }
      section.append(samples);
    }
  };
  render();
}
