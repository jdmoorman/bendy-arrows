import { describe, expect, test } from 'vitest';
import { encodePuzzle } from '../src/codec';
import { applyTable, COLUMNS, DEFAULT_TABLE_STATE, libraryRows, type TableState } from '../src/library-table';
import { createPuzzle } from '../src/model';
import { SAMPLES } from '../src/samples';
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

describe('library table', () => {
  const storage = new Storage(new MemStore());
  const mine = createPuzzle(3, 3);
  mine.walls.add(0);
  storage.put({ id: 'm', name: 'My little loop', code: encodePuzzle(mine), created: 5, updated: 5 });
  const rows = libraryRows(storage, {});

  test('lists saved puzzles and every sample, with their facts', () => {
    expect(rows).toHaveLength(SAMPLES.length + 1);
    const r = rows.find((x) => x.entry)!;
    expect(r).toMatchObject({ name: 'My little loop', collection: 'Yours', type: 'Loop', w: 3, h: 3, walls: 1, black: 0, obstacles: 1, status: 'New' });
    // Not rated yet.
    expect(r.difficulty).toBeUndefined();
    expect(rows.find((x) => !x.entry)!.unique).toBe(true);
  });

  test('deleted samples are left out', () => {
    const store = new Storage(new MemStore());
    store.saveHiddenSamples([SAMPLES[0].code, SAMPLES[1].code]);
    const left = libraryRows(store, {});
    expect(left).toHaveLength(SAMPLES.length - 2);
    expect(left.some((r) => r.code === SAMPLES[0].code)).toBe(false);
  });

  test('a rating fills in difficulty and uniqueness', () => {
    const rated = libraryRows(storage, { [encodePuzzle(mine)]: { difficulty: null, unique: false } });
    const r = rated.find((x) => x.entry)!;
    const show = (key: string) => COLUMNS.find((c) => c.key === key)!.show!(r);
    expect([show('difficulty'), show('unique')]).toEqual(['—', 'No']);
  });

  test('filters by choice values, number ranges and name', () => {
    const loops = applyTable(rows, state({ filters: { type: { values: ['Loop'] } } }));
    expect(loops.length).toBeGreaterThan(0);
    expect(loops.every((r) => r.type === 'Loop')).toBe(true);
    const sparse = applyTable(rows, state({ filters: { obstacles: { max: 1 }, w: { min: 8 } } }));
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.every((r) => r.obstacles <= 1 && r.w >= 8)).toBe(true);
    expect(applyTable(rows, state({ search: 'LITTLE' })).map((r) => r.name)).toEqual(['My little loop']);
    // Rows without a value (an unrated difficulty) fail a filter on it.
    expect(applyTable(rows, state({ filters: { difficulty: { values: ['Easy', 'Medium', 'Hard', 'Very hard'] } } })).some((r) => r.entry)).toBe(false);
  });

  test('sorts numbers, choices in their own order, and missing values last', () => {
    const byObstacles = applyTable(rows, state({ sort: { key: 'obstacles', dir: -1 } })).map((r) => r.obstacles);
    expect(byObstacles).toEqual([...byObstacles].sort((a, b) => b - a));
    const levels = ['Easy', 'Medium', 'Hard', 'Very hard'];
    for (const dir of [1, -1] as const) {
      const sorted = applyTable(rows, state({ sort: { key: 'difficulty', dir } }));
      expect(sorted.at(-1)!.entry).toBeDefined(); // unrated goes last either way
      const ranks = sorted.slice(0, -1).map((r) => levels.indexOf({ easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' }[r.difficulty!]));
      expect(ranks).toEqual([...ranks].sort((a, b) => (a - b) * dir));
    }
  });
});

describe('sample flag', () => {
  test('samples are flagged, your own puzzles are not, and the filter separates them', () => {
    const storage = new Storage(new MemStore());
    storage.put({ id: 'm', name: 'Mine', code: encodePuzzle(createPuzzle(4, 4)), created: 1, updated: 1 });
    const rows = libraryRows(storage, {});
    expect(rows.find((r) => r.name === 'Mine')!.sample).toBe(false);
    expect(rows.filter((r) => !r.entry).every((r) => r.sample)).toBe(true);
    const mine = applyTable(rows, state({ filters: { sample: { values: ['No'] } } }));
    expect(mine.map((r) => r.name)).toEqual(['Mine']);
  });
});
