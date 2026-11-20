import { describe, expect, test } from 'vitest';
import { encodePuzzle } from '../src/codec';
import { applyTable, choicesFor, COLUMNS, DEFAULT_TABLE_STATE, libraryRows, type TableState } from '../src/library-table';
import { PACKS } from '../src/levels';
import { createPuzzle } from '../src/model';
import { SAMPLES } from './samples';
import { Storage, type KeyValueStore } from '../src/storage';

class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const state = (s: Partial<TableState>): TableState => ({ ...DEFAULT_TABLE_STATE, ...s });
/** The official levels, one row each, in their packs' collections. */
const LEVEL_COUNT = PACKS.reduce((n, p) => n + p.levels.length, 0);

describe('library table', () => {
  const storage = new Storage(new MemStore());
  const mine = createPuzzle(3, 3);
  mine.walls.add(0);
  storage.put({ id: 'm', name: 'My little path', code: encodePuzzle(mine), created: 5, updated: 5 });
  // Saved copies of the test corpus, rated as the corpus says (the worker does this in the app).
  SAMPLES.forEach((x, i) => storage.put({ id: `s${i}`, name: x.name, code: x.code, created: i, updated: i }));
  const ratings = Object.fromEntries(SAMPLES.map((x) => [x.code, { difficulty: x.level, unique: true }]));
  const rows = libraryRows(storage, ratings);

  test('lists saved puzzles and every level, with their facts', () => {
    expect(rows).toHaveLength(SAMPLES.length + 1 + LEVEL_COUNT);
    expect(rows.filter((x) => x.key.startsWith('level:')).map((x) => x.collection)).toEqual(PACKS.flatMap((p) => p.levels.map(() => p.name)));
    const r = rows.find((x) => x.entry?.id === 'm')!;
    expect(r).toMatchObject({ name: 'My little path', collection: 'Yours', w: 3, h: 3, walls: 1, black: 0, obstacles: 1, status: 'New' });
    // Not rated yet.
    expect(r.difficulty).toBeUndefined();
  });

  test('a rating fills in difficulty and uniqueness', () => {
    const rated = libraryRows(storage, { [encodePuzzle(mine)]: { difficulty: null, unique: false } });
    const r = rated.find((x) => x.entry?.id === 'm')!;
    const show = (key: string) => COLUMNS.find((c) => c.key === key)!.show!(r);
    expect([show('difficulty'), show('unique')]).toEqual(['—', 'No']);
  });

  test('filters by choice values, number ranges and name', () => {
    const easy = applyTable(rows, state({ filters: { difficulty: { values: ['Easy'] } } }));
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.every((r) => r.difficulty === 'easy')).toBe(true);
    const sparse = applyTable(rows, state({ filters: { obstacles: { max: 1 }, w: { min: 8 } } }));
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.every((r) => r.obstacles <= 1 && r.w >= 8)).toBe(true);
    expect(applyTable(rows, state({ search: 'LITTLE' })).map((r) => r.name)).toEqual(['My little path']);
    // Rows without a value (an unrated difficulty) fail a filter on it.
    expect(applyTable(rows, state({ filters: { difficulty: { values: ['Easy', 'Medium', 'Hard', 'Very hard'] } } })).some((r) => r.entry?.id === 'm')).toBe(false);
  });

  test('sorts numbers, choices in their own order, and missing values last', () => {
    const byObstacles = applyTable(rows, state({ sort: { key: 'obstacles', dir: -1 } })).map((r) => r.obstacles);
    expect(byObstacles).toEqual([...byObstacles].sort((a, b) => b - a));
    const levels = ['Easy', 'Medium', 'Hard', 'Very hard'];
    for (const dir of [1, -1] as const) {
      const sorted = applyTable(rows, state({ sort: { key: 'difficulty', dir } }));
      // Unrated (your new puzzle, and levels before the worker rates them) goes last either way.
      const rated = sorted.filter((r) => r.difficulty);
      expect(rated.length).toBeGreaterThan(0);
      expect(sorted.slice(rated.length).every((r) => !r.difficulty)).toBe(true);
      const ranks = rated.map((r) => levels.indexOf({ easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' }[r.difficulty!]));
      expect(ranks).toEqual([...ranks].sort((a, b) => (a - b) * dir));
    }
  });
});

describe('imported sets', () => {
  const storage = new Storage(new MemStore());
  const a = createPuzzle(2, 2);
  const b = createPuzzle(2, 3);
  storage.put({ id: 'a', name: 'In the set', code: encodePuzzle(a), created: 1, updated: 1, collection: 'unique-levels' });
  storage.put({ id: 'b', name: 'Saved here', code: encodePuzzle(b), created: 2, updated: 2 });
  const rows = libraryRows(storage, {});
  const collection = COLUMNS.find((c) => c.key === 'collection')!;

  test('a set is a Collection value to filter by', () => {
    expect(choicesFor(collection, rows)).toContain('unique-levels');
    const only = applyTable(rows, state({ filters: { collection: { values: ['unique-levels'] } } }));
    expect(only.map((r) => r.name)).toEqual(['In the set']);
  });
});
