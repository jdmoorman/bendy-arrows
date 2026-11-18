import { decodePuzzle } from './codec';
import type { Difficulty } from './generator';
import { openCells, type Puzzle } from './model';
import { LEVELS } from './levels';
import { LOCAL_SAMPLES, type SampleGroup } from './samples';
import type { LibraryEntry, Storage } from './storage';
import { symmetryOf } from './symmetry';

/** One puzzle in the library table: a saved puzzle or a built-in sample. */
export interface LibRow {
  /** Unique within the table. */
  key: string;
  name: string;
  code: string;
  puzzle: Puzzle;
  /** The saved entry, for your own puzzles. */
  entry?: LibraryEntry;
  collection: string;
  /** One of the archived built-in samples (not your own puzzles or an official level). */
  sample: boolean;
  type: 'Path' | 'Numbers';
  /** Undefined while not rated yet; null if it can't be rated (no unique solution). */
  difficulty?: Difficulty | null;
  /** Undefined while not checked yet. */
  unique?: boolean;
  w: number;
  h: number;
  tiles: number;
  walls: number;
  black: number;
  obstacles: number;
  numbers: number;
  symmetric: boolean;
  status: 'New' | 'In progress' | 'Solved';
  added?: number;
}

/** A puzzle's difficulty and uniqueness, worked out in the background for saved puzzles. */
export interface Rating {
  difficulty: Difficulty | null;
  unique: boolean;
}

export const COLLECTIONS: Record<SampleGroup | 'samples' | 'yours' | 'levels', string> = {
  levels: 'Levels',
  yours: 'Yours',
  samples: 'Samples',
  one: 'Sparse: one obstacle',
  fewest: 'Sparse: fewest obstacles',
  hardsparse: 'Sparse: hard',
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' };
const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'veryhard'];

function puzzleFacts(p: Puzzle) {
  return {
    type: (p.checkpoints.length ? 'Numbers' : 'Path') as LibRow['type'],
    w: p.w,
    h: p.h,
    tiles: openCells(p).length,
    walls: p.walls.size,
    black: p.blocked.size,
    obstacles: p.walls.size + p.blocked.size,
    numbers: p.checkpoints.length,
    symmetric: symmetryOf(p) !== null,
  };
}

/** Facts that never change for a puzzle code, worked out once. */
const factCache = new Map<string, { puzzle: Puzzle } & ReturnType<typeof puzzleFacts>>();
function facts(code: string) {
  let f = factCache.get(code);
  if (!f) {
    const puzzle = decodePuzzle(code);
    f = { puzzle, ...puzzleFacts(puzzle) };
    factCache.set(code, f);
  }
  return f;
}

/** Every saved puzzle and every sample not deleted on this device, as table rows. */
export function libraryRows(storage: Storage, ratings: Record<string, Rating>): LibRow[] {
  const rows: LibRow[] = [];
  const play = (code: string, saved?: LibraryEntry) => {
    const solved = storage.isSolved(code) || !!saved?.solved;
    return {
      status: (solved ? 'Solved' : saved?.progress?.segments.length ? 'In progress' : 'New') as LibRow['status'],
    };
  };
  for (const e of storage.list()) {
    let f;
    try {
      f = facts(e.code);
    } catch {
      continue;
    }
    const r = ratings[e.code];
    rows.push({ key: `saved:${e.id}`, name: e.name, code: e.code, entry: e, collection: COLLECTIONS.yours, sample: false, ...f, difficulty: r?.difficulty, unique: r?.unique, ...play(e.code, e), added: e.created });
  }
  // Official levels, shipped to everyone.
  LEVELS.forEach((l, i) => {
    let f;
    try {
      f = facts(l.code);
    } catch {
      return;
    }
    const saved = storage.findByCode(l.code);
    rows.push({ key: `level:${i}`, name: l.name, code: l.code, collection: COLLECTIONS.levels, sample: false, ...f, difficulty: l.level, unique: true, ...play(l.code, saved) });
  });
  const hidden = new Set(storage.loadHiddenSamples());
  LOCAL_SAMPLES.forEach((s, i) => {
    if (hidden.has(s.code)) return;
    const f = facts(s.code);
    const saved = storage.findByCode(s.code);
    rows.push({ key: `sample:${i}`, name: s.name, code: s.code, collection: COLLECTIONS[s.group ?? 'samples'], sample: true, ...f, difficulty: s.level, unique: true, ...play(s.code, saved) });
  });
  return rows;
}

/** How a column filters: by a set of values, or a numeric range. */
export type ColumnKind = 'choice' | 'number';

export interface Column {
  key: string;
  label: string;
  /** Short header for narrow tables (defaults to label). */
  short?: string;
  kind: ColumnKind;
  /** The value used to sort and filter (null sorts last and fails range filters). */
  value(r: LibRow): string | number | null;
  /** What the cell shows (defaults to the value). */
  show?(r: LibRow): string;
  /** For choice columns: every value, in order. */
  choices?: string[];
}

const yesNo = (b: boolean | undefined) => (b === undefined ? null : b ? 'Yes' : 'No');

export const COLUMNS: Column[] = [
  { key: 'collection', label: 'Collection', kind: 'choice', value: (r) => r.collection, choices: Object.values(COLLECTIONS) },
  { key: 'sample', label: 'Sample', kind: 'choice', value: (r) => (r.sample ? 'Yes' : 'No'), choices: ['Yes', 'No'] },
  { key: 'type', label: 'Type', kind: 'choice', value: (r) => r.type, choices: ['Path', 'Numbers'] },
  {
    key: 'difficulty',
    label: 'Difficulty',
    kind: 'choice',
    value: (r) => (r.difficulty ? DIFFICULTY_NAMES[r.difficulty] : null),
    show: (r) => (r.difficulty ? DIFFICULTY_NAMES[r.difficulty] : r.difficulty === null ? '—' : '…'),
    choices: DIFFICULTY_ORDER.map((d) => DIFFICULTY_NAMES[d]),
  },
  { key: 'w', label: 'Width', short: 'W', kind: 'number', value: (r) => r.w },
  { key: 'h', label: 'Height', short: 'H', kind: 'number', value: (r) => r.h },
  { key: 'tiles', label: 'Tiles to visit', short: 'Tiles', kind: 'number', value: (r) => r.tiles },
  { key: 'walls', label: 'Walls', kind: 'number', value: (r) => r.walls },
  { key: 'black', label: 'Black tiles', short: 'Black', kind: 'number', value: (r) => r.black },
  { key: 'obstacles', label: 'Obstacles', short: 'Obst.', kind: 'number', value: (r) => r.obstacles },
  {
    key: 'density',
    label: 'Obstacles per 100 tiles',
    short: 'Obst. %',
    kind: 'number',
    value: (r) => Math.round((100 * r.obstacles) / (r.w * r.h)),
  },
  { key: 'numbers', label: 'Numbers', short: 'Nums', kind: 'number', value: (r) => r.numbers },
  { key: 'symmetric', label: 'Symmetric', short: 'Sym.', kind: 'choice', value: (r) => yesNo(r.symmetric), choices: ['Yes', 'No'] },
  { key: 'unique', label: 'Unique solution', short: 'Unique', kind: 'choice', value: (r) => yesNo(r.unique), show: (r) => yesNo(r.unique) ?? '…', choices: ['Yes', 'No'] },
  { key: 'status', label: 'Status', kind: 'choice', value: (r) => r.status, choices: ['New', 'In progress', 'Solved'] },
  {
    key: 'added',
    label: 'Added',
    kind: 'number',
    value: (r) => r.added ?? null,
    show: (r) => (r.added ? new Date(r.added).toLocaleDateString() : ''),
  },
];

/** Columns shown until the player picks their own. */
export const DEFAULT_COLUMNS = ['type', 'difficulty', 'w', 'h', 'obstacles', 'symmetric', 'status'];

/** A filter on one column: allowed values for a choice column, a range for a number column. */
export type Filter = { values: string[] } | { min?: number; max?: number };

export interface TableState {
  /** Text the name must contain. */
  search: string;
  filters: Record<string, Filter>;
  sort: { key: string; dir: 1 | -1 } | null;
  columns: string[];
}

export const DEFAULT_TABLE_STATE: TableState = { search: '', filters: {}, sort: null, columns: DEFAULT_COLUMNS };

/** Whether a filter actually restricts anything. */
export function filterActive(f: Filter | undefined): boolean {
  if (!f) return false;
  return 'values' in f ? f.values.length > 0 : f.min !== undefined || f.max !== undefined;
}

export function columnByKey(key: string): Column | undefined {
  return key === 'name' ? NAME_COLUMN : COLUMNS.find((c) => c.key === key);
}

/** The name column: always shown, sortable, filtered by the search box. */
export const NAME_COLUMN: Column = { key: 'name', label: 'Name', kind: 'choice', value: (r) => r.name.toLocaleLowerCase() };

/** Rows that pass the search and every filter, sorted. */
export function applyTable(rows: LibRow[], state: TableState): LibRow[] {
  const search = state.search.trim().toLocaleLowerCase();
  const active = Object.entries(state.filters).filter(([, f]) => filterActive(f));
  const out = rows.filter((r) => {
    if (search && !r.name.toLocaleLowerCase().includes(search)) return false;
    for (const [key, f] of active) {
      const col = columnByKey(key);
      if (!col) continue;
      const v = col.value(r);
      if ('values' in f) {
        if (v === null || !f.values.includes(String(v))) return false;
      } else {
        if (typeof v !== 'number') return false;
        if (f.min !== undefined && v < f.min) return false;
        if (f.max !== undefined && v > f.max) return false;
      }
    }
    return true;
  });
  const sort = state.sort;
  const col = sort && columnByKey(sort.key);
  if (sort && col) {
    // Choice columns sort in their listed order (Easy before Medium), not alphabetically.
    const rank = (v: string | number | null) => (col.choices && typeof v === 'string' ? col.choices.indexOf(v) : v);
    out.sort((a, b) => {
      const x = rank(col.value(a));
      const y = rank(col.value(b));
      // Missing values go last whichever way the column is sorted.
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }
  return out;
}
