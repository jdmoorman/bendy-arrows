import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
import { applyTable, choicesFor, COLUMNS, DEFAULT_TABLE_STATE, libraryRows, type TableState } from '../src/library-table';
import { ALL_PACKS } from '../src/levels';
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
/** The official levels, one row each, in the Level packs collection with their packs. */
const LEVEL_COUNT = ALL_PACKS.reduce((n, p) => n + p.levels.length, 0);

describe('library table', () => {
  const storage = new Storage(new MemStore());
  const mine = createPuzzle(3, 3);
  mine.walls.add(0);
  storage.put({ id: 'm', name: 'My little path', code: encodePuzzle(mine), created: 5, updated: 5 });
  // Saved copies of the test corpus, rated as the corpus says (the worker does this in the app).
  SAMPLES.forEach((x, i) => storage.put({ id: `s${i}`, name: x.name, code: x.code, created: i, updated: i }));
  // Every sample is unique with a few hint steps, except the first, which has no unique solution.
  const ratings = Object.fromEntries(SAMPLES.map((x, i) => [x.code, i ? { unique: true, hints: i % 4 } : { unique: false, hints: null }]));
  const rows = libraryRows(storage, ratings);

  test('lists saved puzzles and every level, with their facts', () => {
    expect(rows).toHaveLength(SAMPLES.length + 1 + LEVEL_COUNT);
    const levels = rows.filter((x) => x.key.startsWith('level:'));
    expect(levels.every((x) => x.collection === 'Level packs')).toBe(true);
    expect(levels.map((x) => x.pack)).toEqual(ALL_PACKS.flatMap((p) => p.levels.map(() => p.name)));
    const r = rows.find((x) => x.entry?.id === 'm')!;
    expect(r).toMatchObject({ name: 'My little path', collection: 'Yours', w: 3, h: 3, walls: 1, black: 0, obstacles: 1, status: 'New' });
    // Not rated yet.
    expect(r.hints).toBeUndefined();
    expect(r.unique).toBeUndefined();
  });

  test('a rating fills in hint steps and uniqueness', () => {
    const rated = libraryRows(storage, { [encodePuzzle(mine)]: { unique: false, hints: null } });
    const r = rated.find((x) => x.entry?.id === 'm')!;
    const show = (key: string) => COLUMNS.find((c) => c.key === key)!.show!(r);
    expect([show('hints'), show('unique')]).toEqual(['—', 'No']);
  });

  test('the Pack filter picks out the levels of the chosen packs', () => {
    const [a, b] = ALL_PACKS;
    const picked = applyTable(rows, state({ filters: { pack: { values: [a.name, b.name] } } }));
    // Their levels, and any saved puzzles that are those levels too.
    expect(picked.filter((r) => !r.entry).length).toBe(a.levels.length + b.levels.length);
    expect(picked.every((r) => r.pack === a.name || r.pack === b.name)).toBe(true);
    expect(COLUMNS.find((c) => c.key === 'pack')!.show!(rows.find((r) => r.entry?.id === 'm')!)).toBe('—');
  });

  test('the Pack filter’s None keeps the puzzles in no pack, alongside any packs chosen', () => {
    const pack = ALL_PACKS[0];
    const picked = applyTable(rows, state({ filters: { pack: { values: ['None', pack.name] } } }));
    expect(picked.some((r) => r.entry?.id === 'm')).toBe(true);
    expect(picked.every((r) => !r.pack || r.pack === pack.name)).toBe(true);
    expect(picked.filter((r) => !r.entry).length).toBe(pack.levels.length);
  });

  test('filters by choice values, number ranges and name', () => {
    const unique = applyTable(rows, state({ filters: { unique: { values: ['Yes'] } } }));
    expect(unique.length).toBeGreaterThan(0);
    expect(unique.every((r) => r.unique === true)).toBe(true);
    const sparse = applyTable(rows, state({ filters: { obstacles: { max: 1 }, w: { min: 8 } } }));
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.every((r) => r.obstacles <= 1 && r.w >= 8)).toBe(true);
    expect(applyTable(rows, state({ search: 'LITTLE' })).map((r) => r.name)).toEqual(['My little path']);
    // Rows without a value (not rated yet) fail a filter on it.
    expect(applyTable(rows, state({ filters: { hints: { min: 0 } } })).some((r) => r.entry?.id === 'm')).toBe(false);
  });

  test('sorts numbers, choices in their own order, and missing values last', () => {
    for (const dir of [1, -1] as const) {
      const sorted = applyTable(rows, state({ sort: { key: 'hints', dir } }));
      // Unrated (your new puzzle, and levels before the worker rates them) goes last either way.
      const rated = sorted.filter((r) => typeof r.hints === 'number');
      expect(rated.length).toBeGreaterThan(0);
      expect(sorted.slice(rated.length).every((r) => typeof r.hints !== 'number')).toBe(true);
      const hints = rated.map((r) => r.hints!);
      expect(hints).toEqual([...hints].sort((a, b) => (a - b) * dir));
      const byUnique = applyTable(rows, state({ sort: { key: 'unique', dir } })).map((r) => r.unique);
      const known = byUnique.filter((u) => u !== undefined);
      expect(byUnique.slice(known.length).every((u) => u === undefined)).toBe(true);
      // Yes before No, in the column's own order.
      expect(known).toEqual([...known].sort((a, b) => (Number(b) - Number(a)) * dir));
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

describe('a saved puzzle added to a pack', async () => {
  const { orientTail, transformPuzzle } = await import('../src/model');
  test('gains that pack in the Pack column (even turned or made a one-shot on the way), keeping its collection', () => {
    const storage = new Storage(new MemStore());
    const level = decodePuzzle(ALL_PACKS[1].levels[0]);
    // The Library copy as it was saved: the level turned round and not a one-shot.
    const copy = transformPuzzle({ ...level, oneShot: undefined }, 'rotateRight');
    expect(encodePuzzle(orientTail(copy))).not.toBe(ALL_PACKS[1].levels[0]);
    storage.put({ id: 'c', name: 'My draft', code: encodePuzzle(copy), created: 1, updated: 1, collection: 'imported-set' });
    storage.put({ id: 'o', name: 'Other', code: encodePuzzle(createPuzzle(3, 3)), created: 2, updated: 2 });
    const rows = libraryRows(storage, {});
    expect(rows.find((r) => r.entry?.id === 'c')).toMatchObject({ collection: 'imported-set', pack: ALL_PACKS[1].name });
    expect(rows.find((r) => r.entry?.id === 'o')).toMatchObject({ collection: 'Yours', pack: undefined });
  });
});
