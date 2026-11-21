import { decodePuzzle } from './codec';
import type { Difficulty } from './generator';
import { openCells, type Puzzle } from './model';
import { levelName, PACKS } from './levels';
import type { LibraryEntry, Storage } from './storage';
import { symmetryOf } from './symmetry';

/** One puzzle in the library table: a saved puzzle or an official level. */
export interface LibRow {
  /** Unique within the table. */
  key: string;
  name: string;
  code: string;
  puzzle: Puzzle;
  /** The saved entry, for your own puzzles. */
  entry?: LibraryEntry;
  collection: string;
  /** Undefined while not rated yet; null if it can't be rated (no unique solution). */
  difficulty?: Difficulty | null;
  /** Undefined while not checked yet. */
  unique?: boolean;
  /** Hints a player alternating easy rules and hints needs (undefined while not worked out, null if not unique). */
  hints?: number | null;
  /** The easy rules and hints got stuck before the end, so it takes more than `hints`. */
  hintsStuck?: boolean;
  /** Undecided borders per available move at the hardest-to-find moment (undefined while not worked out). */
  tightest?: number | null;
  /** Undecided borders per available move, summed over the solve. */
  effort?: number | null;
  w: number;
  h: number;
  tiles: number;
  walls: number;
  black: number;
  obstacles: number;
  symmetric: boolean;
  status: 'New' | 'In progress' | 'Solved';
  added?: number;
}

/**
 * Bump when the logic changes in a way that changes ratings: older ratings are shown until
 * the background worker has redone them.
 */
export const RATING_VERSION = 4;

/** A puzzle's difficulty and uniqueness, worked out in the background for saved puzzles. */
export interface Rating {
  /** RATING_VERSION when it was worked out (missing before versions). */
  v?: number;
  difficulty: Difficulty | null;
  unique: boolean;
  /** Steps beyond the easy rules: the lines under the editor's difficulty chip (missing in old ratings). */
  hints?: number | null;
  /** The hints ran out before the puzzle was solved. */
  hintsStuck?: boolean;
  /** How hidden the moves are (see searchMetrics in logic.ts); missing in old ratings. */
  tightest?: number | null;
  effort?: number | null;
}

export const COLLECTIONS = {
  yours: 'Yours',
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' };
const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'veryhard'];

function puzzleFacts(p: Puzzle) {
  return {
    w: p.w,
    h: p.h,
    tiles: openCells(p).length,
    walls: p.walls.size,
    black: p.blocked.size,
    obstacles: p.walls.size + p.blocked.size,
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

const hintsOf = (r: Rating | undefined) => ({ hints: r?.hints, hintsStuck: r?.hintsStuck, tightest: r?.tightest, effort: r?.effort });

/** Every saved puzzle and every official level, as table rows. */
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
    rows.push({ key: `saved:${e.id}`, name: e.name, code: e.code, entry: e, collection: e.collection ?? COLLECTIONS.yours, ...f, difficulty: r?.difficulty, unique: r?.unique, ...hintsOf(r), ...play(e.code, e), added: e.created });
  }
  // The official level packs, shipped to everyone: each pack is a collection.
  PACKS.forEach((pack, pi) =>
    pack.levels.forEach((code, li) => {
      let f;
      try {
        f = facts(code);
      } catch {
        return;
      }
      const saved = storage.findByCode(code);
      const r = ratings[code];
      rows.push({ key: `level:${pi}:${li}`, name: levelName({ pack: pi, level: li }), code, collection: pack.name, ...f, difficulty: r?.difficulty, unique: r?.unique, ...hintsOf(r), ...play(code, saved) });
    }),
  );
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
  { key: 'collection', label: 'Collection', kind: 'choice', value: (r) => r.collection, choices: [COLLECTIONS.yours, ...PACKS.map((p) => p.name)] },
  {
    key: 'difficulty',
    label: 'Difficulty',
    kind: 'choice',
    value: (r) => (r.difficulty ? DIFFICULTY_NAMES[r.difficulty] : null),
    show: (r) => (r.difficulty ? DIFFICULTY_NAMES[r.difficulty] : r.difficulty === null ? '—' : '…'),
    choices: DIFFICULTY_ORDER.map((d) => DIFFICULTY_NAMES[d]),
  },
  {
    key: 'hints',
    label: 'Hint steps',
    short: 'Hints',
    kind: 'number',
    value: (r) => r.hints ?? null,
    show: (r) => (r.hints === undefined ? '…' : r.hints === null ? '—' : `${r.hints}${r.hintsStuck ? '+' : ''}`),
  },
  {
    key: 'tightest',
    label: 'Crux',
    kind: 'number',
    value: (r) => r.tightest ?? null,
    show: (r) => (r.tightest === undefined ? '…' : r.tightest === null ? '—' : String(r.tightest)),
  },
  {
    key: 'effort',
    label: 'Effort',
    kind: 'number',
    value: (r) => r.effort ?? null,
    show: (r) => (r.effort === undefined ? '…' : r.effort === null ? '—' : String(r.effort)),
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
export const DEFAULT_COLUMNS = ['difficulty', 'hints', 'w', 'h', 'obstacles', 'symmetric', 'status'];

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

/** A choice column's values: its own list, then any others the rows have (e.g. imported sets). */
export function choicesFor(c: Column, rows: LibRow[]): string[] {
  const listed = c.choices ?? [];
  const extra = new Set<string>();
  for (const r of rows) {
    const v = c.value(r);
    if (v !== null && !listed.includes(String(v))) extra.add(String(v));
  }
  return [...listed, ...[...extra].sort((a, b) => a.localeCompare(b))];
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
