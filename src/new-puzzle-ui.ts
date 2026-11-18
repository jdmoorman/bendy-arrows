import { generateInBackground, type GeneratorRun } from './generator-client';
import { DIFFICULTIES, randomSeed, type ClueKind, type Difficulty, type GenOptions, type GenType } from './generator';
import { ICONS } from './icons';
import type { Puzzle } from './model';
import type { Storage } from './storage';
import { el, openSheet } from './ui';

/** Sizes the generator offers (bigger boards take too long to make unique). */
const GEN_MIN = 4;
const GEN_MAX = 12;

export interface NewPuzzleContext {
  storage: Storage;
  /** Size of the puzzle being edited; the sheet starts at this size. */
  w: number;
  h: number;
  onBlank(w: number, h: number): void;
  onGenerated(p: Puzzle, info: { options: GenOptions; difficulty: Difficulty }): void;
}

const TYPES: [GenType, string][] = [
  ['path', 'Path'],
  ['checkpoints', 'Numbers'],
];
const DIFFS: [Difficulty, string][] = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
  ['veryhard', 'Very hard'],
];
const CLUES: [ClueKind, string][] = [
  ['mixed', 'Walls & tiles'],
  ['walls', 'Walls only'],
  ['tiles', 'Tiles only'],
];

/** The last-used options (the size comes from the sheet's size picker). */
type Saved = Omit<GenOptions, 'seed' | 'w' | 'h'>;

/** Choices for the obstacle limit. */
const MAX_OBSTACLE_CHOICES = 30;

function savedOptions(storage: Storage): Saved {
  const o = storage.loadGeneratorOptions() ?? {};
  const oneOf = <T extends string>(v: unknown, list: [T, string][], d: T): T => (list.some(([k]) => k === v) ? (v as T) : d);
  return {
    type: oneOf(o.type, TYPES, 'path'),
    difficulties: savedDifficulties(o),
    clues: oneOf(o.clues, CLUES, 'mixed'),
    minimal: typeof o.minimal === 'boolean' ? o.minimal : true,
    maxObstacles: typeof o.maxObstacles === 'number' && o.maxObstacles >= 0 ? o.maxObstacles : undefined,
  };
}

/** The saved difficulties; older saves kept one difficulty, or 'any' for all of them. */
function savedDifficulties(o: Record<string, unknown>): Difficulty[] {
  const saved = Array.isArray(o.difficulties) ? o.difficulties : o.difficulty === 'any' ? DIFFICULTIES : [o.difficulty];
  const list = DIFFICULTIES.filter((d) => saved.includes(d));
  return list.length ? list : ['easy'];
}

/** A row of buttons that each switch on and off; at least one stays on. */
function multiToggle<T extends string>(label: string, options: [T, string][], value: T[], onChange: (v: T[]) => void): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  let chosen = [...value];
  const buttons = options.map(([k, text]) => {
    const b = el('button', 'seg-btn', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(chosen.includes(k)));
    b.addEventListener('click', () => {
      const on = chosen.includes(k);
      if (on && chosen.length === 1) return; // keep at least one
      chosen = options.map(([x]) => x).filter((x) => (x === k ? !on : chosen.includes(x)));
      b.setAttribute('aria-pressed', String(!on));
      onChange(chosen);
    });
    return b;
  });
  group.append(...buttons);
  return group;
}

/** A row of mutually exclusive buttons. */
function segmented<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons = options.map(([k, text]) => {
    const b = el('button', 'seg-btn', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(k === value));
    b.addEventListener('click', () => {
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
      onChange(k);
    });
    return b;
  });
  group.append(...buttons);
  return group;
}

function sizePicker(w: number, h: number, min: number, max: number, onChange: (w: number, h: number) => void) {
  const opts = Array.from({ length: max - min + 1 }, (_, i) => `<option>${i + min}</option>`).join('');
  const label = el(
    'label',
    'size-picker',
    `<select aria-label="Width">${opts}</select><span aria-hidden="true">×</span><select aria-label="Height">${opts}</select>`,
  );
  const [ws, hs] = label.querySelectorAll('select');
  const set = (a: number, b: number) => {
    ws.value = String(a);
    hs.value = String(b);
  };
  set(w, h);
  const changed = () => onChange(+ws.value, +hs.value);
  ws.addEventListener('change', changed);
  hs.addEventListener('change', changed);
  return { el: label, set };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function sizeRow(picker: { el: HTMLElement }): HTMLElement {
  const row = el('div', 'sheet-row size-row');
  row.append(el('span', 'field-label', 'Size'), picker.el);
  return row;
}

/** The editor's New puzzle sheet: an empty grid of any size. */
export function openBlankPuzzleSheet(ctx: NewPuzzleContext): void {
  const body = el('div', 'sheet-stack new-puzzle');
  const sheet = openSheet('New puzzle', body);
  let size = { w: ctx.w, h: ctx.h };
  const picker = sizePicker(size.w, size.h, 1, 30, (w, h) => (size = { w, h }));
  const create = el('button', 'btn primary', `${ICONS.plus}<span>Create</span>`);
  create.addEventListener('click', () => {
    ctx.onBlank(size.w, size.h);
    sheet.close();
  });
  body.append(sizeRow(picker), create);
}

/** The editor's Generate sheet: a random puzzle with the chosen options. */
export function openGeneratorSheet(ctx: NewPuzzleContext): void {
  const body = el('div', 'sheet-stack new-puzzle');
  const sheet = openSheet('Generate a puzzle', body);
  let run: GeneratorRun | null = null;
  sheet.dialog.addEventListener('close', () => run?.cancel());
  let size = { w: clamp(ctx.w, GEN_MIN, GEN_MAX), h: clamp(ctx.h, GEN_MIN, GEN_MAX) };
  const picker = sizePicker(size.w, size.h, GEN_MIN, GEN_MAX, (w, h) => (size = { w, h }));

  // --- Generate ---
  const o = savedOptions(ctx.storage);
  const save = () => ctx.storage.saveGeneratorOptions(o);
  const minimal = el('label', 'switch-row');
  const minimalText = el('span', 'switch-text');
  minimalText.append(document.createTextNode('Minimal clues'), Object.assign(el('small'), { textContent: 'Remove every wall, tile and number the puzzle doesn’t need' }));
  const minimalInput = el('input', 'switch') as HTMLInputElement;
  minimalInput.type = 'checkbox';
  minimalInput.setAttribute('role', 'switch');
  minimalInput.checked = o.minimal;
  minimalInput.addEventListener('change', () => {
    o.minimal = minimalInput.checked;
    save();
  });
  minimal.append(minimalText, minimalInput);

  // Sparsity: at most this many walls and black tiles.
  const maxRow = el('label', 'switch-row');
  const maxText = el('span', 'switch-text');
  maxText.append(document.createTextNode('Max obstacles'), Object.assign(el('small'), { textContent: 'At most this many walls and black tiles (ends and numbers don’t count)' }));
  const maxSelect = el('select', 'max-obstacles') as HTMLSelectElement;
  maxSelect.setAttribute('aria-label', 'Max obstacles');
  maxSelect.innerHTML = `<option value="">Any</option>${Array.from({ length: MAX_OBSTACLE_CHOICES + 1 }, (_, i) => `<option>${i}</option>`).join('')}`;
  maxSelect.value = o.maxObstacles === undefined ? '' : String(o.maxObstacles);
  maxSelect.addEventListener('change', () => {
    o.maxObstacles = maxSelect.value === '' ? undefined : Number(maxSelect.value);
    save();
  });
  maxRow.append(maxText, maxSelect);

  const seedInput = el('input', 'text-input seed-input') as HTMLInputElement;
  seedInput.inputMode = 'numeric';
  seedInput.setAttribute('aria-label', 'Seed');
  seedInput.value = String(randomSeed());
  const dice = el('button', 'btn icon-only', ICONS.dice);
  dice.setAttribute('aria-label', 'New random seed');
  dice.addEventListener('click', () => (seedInput.value = String(randomSeed())));
  const seedRow = el('div', 'sheet-row seed-row');
  seedRow.append(seedInput, dice);

  const status = el('p', 'field-label gen-status');
  const genBtn = el('button', 'btn primary', `${ICONS.step}<span>Generate</span>`);

  const cancelBtn = el('button', 'btn hidden', '<span>Cancel</span>');
  const genRow = el('div', 'sheet-row');
  genRow.append(cancelBtn, genBtn);

  const busy = (on: boolean) => {
    genBtn.disabled = on;
    cancelBtn.classList.toggle('hidden', !on);
  };
  cancelBtn.addEventListener('click', () => {
    run?.cancel();
    run = null;
    busy(false);
    status.textContent = 'Cancelled.';
  });
  genBtn.addEventListener('click', async () => {
    const seed = Number.parseInt(seedInput.value, 10);
    const options: GenOptions = { ...o, w: size.w, h: size.h, seed: Number.isFinite(seed) ? Math.abs(seed) : randomSeed() };
    seedInput.value = String(options.seed);
    busy(true);
    status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Generating…';
    const thisRun = generateInBackground(options, (attempt) => {
      if (attempt > 1) status.innerHTML = `<span class="spinner" aria-hidden="true"></span> Generating… (try ${attempt})`;
    });
    run = thisRun;
    try {
      const r = await thisRun.result;
      if (run !== thisRun) return;
      run = null;
      sheet.close();
      ctx.onGenerated(r.puzzle, { options, difficulty: r.difficulty });
    } catch (err) {
      if (run !== thisRun) return;
      run = null;
      busy(false);
      if ((err as Error).name !== 'AbortError') status.textContent = (err as Error).message;
    }
  });

  body.append(
    sizeRow(picker),
    segmented('Puzzle type', TYPES, o.type, (v) => {
      o.type = v;
      save();
    }),
    el('p', 'field-label', 'Difficulty (any of the chosen)'),
    multiToggle('Difficulty', DIFFS, o.difficulties, (v) => {
      o.difficulties = v;
      save();
    }),
    segmented('Clues', CLUES, o.clues, (v) => {
      o.clues = v;
      save();
    }),
    minimal,
    maxRow,
    el('p', 'field-label', 'Seed (the same options and seed always give the same puzzle)'),
    seedRow,
    status,
    genRow,
  );
}
