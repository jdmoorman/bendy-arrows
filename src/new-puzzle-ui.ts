import { generateInBackground, type GeneratorRun } from './generator-client';
import { DEFAULT_SIZE, randomSeed, type ClueKind, type Difficulty, type GenOptions, type GenType } from './generator';
import { ICONS } from './icons';
import type { Puzzle } from './model';
import type { Storage } from './storage';
import { el, openSheet } from './ui';

/** Sizes the generator offers (bigger boards take too long to make unique). */
const GEN_MIN = 4;
const GEN_MAX = 12;

export interface NewPuzzleContext {
  storage: Storage;
  /** Size of the puzzle being edited, for a blank one. */
  w: number;
  h: number;
  onBlank(w: number, h: number): void;
  onGenerated(p: Puzzle, info: { options: GenOptions; difficulty: Difficulty }): void;
}

const TYPES: [GenType, string][] = [
  ['loop', 'Loop'],
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

/** The last-used options, and whether the size was picked by hand. */
type Saved = Omit<GenOptions, 'seed'> & { sizeChosen: boolean };

function savedOptions(storage: Storage): Saved {
  const o = storage.loadGeneratorOptions() ?? {};
  const oneOf = <T extends string>(v: unknown, list: [T, string][], d: T): T => (list.some(([k]) => k === v) ? (v as T) : d);
  const size = (v: unknown, d: number) => (typeof v === 'number' && v >= GEN_MIN && v <= GEN_MAX ? v : d);
  const difficulty = oneOf(o.difficulty, DIFFS, 'easy');
  return {
    type: oneOf(o.type, TYPES, 'path'),
    difficulty,
    clues: oneOf(o.clues, CLUES, 'mixed'),
    w: size(o.w, DEFAULT_SIZE[difficulty]),
    h: size(o.h, DEFAULT_SIZE[difficulty]),
    minimal: typeof o.minimal === 'boolean' ? o.minimal : true,
    sizeChosen: o.sizeChosen === true,
  };
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

/** The editor's New puzzle sheet: a blank grid, or a generated puzzle. */
export function openNewPuzzleSheet(ctx: NewPuzzleContext): void {
  const body = el('div', 'sheet-stack new-puzzle');
  const sheet = openSheet('New puzzle', body);
  let run: GeneratorRun | null = null;
  sheet.dialog.addEventListener('close', () => run?.cancel());

  // --- Blank ---
  let blank = { w: ctx.w, h: ctx.h };
  const blankSize = sizePicker(ctx.w, ctx.h, 1, 30, (w, h) => (blank = { w, h }));
  const blankBtn = el('button', 'btn', `${ICONS.plus}<span>Blank puzzle</span>`);
  blankBtn.addEventListener('click', () => {
    ctx.onBlank(blank.w, blank.h);
    sheet.close();
  });
  const blankRow = el('div', 'sheet-row');
  blankRow.append(blankSize.el, blankBtn);
  body.append(el('p', 'field-label', 'Start from an empty grid'), blankRow, el('hr', 'sheet-sep'));

  // --- Generate ---
  const o = savedOptions(ctx.storage);
  const save = () => ctx.storage.saveGeneratorOptions(o);
  const genSize = sizePicker(o.w, o.h, GEN_MIN, GEN_MAX, (w, h) => {
    o.w = w;
    o.h = h;
    o.sizeChosen = true;
    save();
  });
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
    const { sizeChosen: _, ...chosen } = o;
    const options: GenOptions = { ...chosen, seed: Number.isFinite(seed) ? Math.abs(seed) : randomSeed() };
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
    el('p', 'field-label', 'Or generate one'),
    segmented('Puzzle type', TYPES, o.type, (v) => {
      o.type = v;
      save();
    }),
    segmented('Difficulty', DIFFS, o.difficulty, (v) => {
      o.difficulty = v;
      // Follow the difficulty's usual size until the size is chosen by hand.
      if (!o.sizeChosen) {
        o.w = o.h = DEFAULT_SIZE[v];
        genSize.set(o.w, o.h);
      }
      save();
    }),
    segmented('Clues', CLUES, o.clues, (v) => {
      o.clues = v;
      save();
    }),
    genSize.el,
    minimal,
    el('p', 'field-label', 'Seed (the same options and seed always give the same puzzle)'),
    seedRow,
    status,
    genRow,
  );
}
