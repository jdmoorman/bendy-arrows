import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
import { libraryRows, needsRating, RATING_VERSION } from '../src/library-table';
import { ALL_PACKS } from '../src/levels';
import { createPuzzle, orientTail, transformPuzzle } from '../src/model';
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

describe('library', () => {
  const storage = new Storage(new MemStore());
  const mine = createPuzzle(3, 3);
  mine.walls.add(0);
  storage.put({ id: 'm', name: 'My little path', code: encodePuzzle(mine), created: 5, updated: 5 });
  const shot = decodePuzzle(ALL_PACKS.find((p) => p.oneShot)!.levels[0]);
  // A one-shot of your own (a pack level turned round: not that level, so in no pack).
  const turned = orientTail(transformPuzzle(shot, 'rotateRight'));
  storage.put({ id: 's', name: 'A stroke', code: encodePuzzle(turned), created: 9, updated: 9 });

  test('lists only your saved puzzles (never the shipped levels), newest change first', () => {
    const rows = libraryRows(storage, {});
    expect(rows.map((r) => r.entry.id)).toEqual(['s', 'm']);
    expect(rows.map((r) => r.oneShot)).toEqual([true, false]);
    // Not rated yet.
    expect(rows[1]).toMatchObject({ name: 'My little path', solved: false, hints: undefined, unique: undefined, segments: undefined });
  });

  test('a rating fills in hints and the solution', () => {
    const r = libraryRows(storage, { [encodePuzzle(mine)]: { v: RATING_VERSION, unique: true, hints: 2, segments: [1, 2] } }).find((x) => x.entry.id === 'm')!;
    expect(r).toMatchObject({ unique: true, hints: 2, segments: [1, 2] });
  });

  test('ratings are redone when from older rules, or without the solution a card shows', () => {
    expect(needsRating(undefined)).toBe(true);
    expect(needsRating({ v: RATING_VERSION - 1, unique: true, hints: 1, segments: [1] })).toBe(true);
    expect(needsRating({ v: RATING_VERSION, unique: true, hints: 1 })).toBe(true);
    expect(needsRating({ v: RATING_VERSION, unique: true, hints: 1, segments: [1] })).toBe(false);
    expect(needsRating({ v: RATING_VERSION, unique: false, hints: null })).toBe(false);
  });
});

describe('a saved puzzle added to a pack', () => {
  test('shows that pack (even turned or made a one-shot on the way)', () => {
    const storage = new Storage(new MemStore());
    const level = decodePuzzle(ALL_PACKS[1].levels[0]);
    // The Library copy as it was saved: the level turned round and not a one-shot.
    const copy = transformPuzzle({ ...level, oneShot: undefined }, 'rotateRight');
    expect(encodePuzzle(orientTail(copy))).not.toBe(ALL_PACKS[1].levels[0]);
    storage.put({ id: 'c', name: 'My draft', code: encodePuzzle(copy), created: 1, updated: 1, collection: 'imported-set' });
    storage.put({ id: 'o', name: 'Other', code: encodePuzzle(createPuzzle(3, 3)), created: 2, updated: 2 });
    const rows = libraryRows(storage, {});
    expect(rows.find((r) => r.entry.id === 'c')).toMatchObject({ pack: ALL_PACKS[1].name });
    expect(rows.find((r) => r.entry.id === 'o')!.pack).toBeUndefined();
  });

  test('shows that pack when saved with the level’s own code', () => {
    const storage = new Storage(new MemStore());
    for (const pack of [ALL_PACKS.find((p) => !p.oneShot)!, ALL_PACKS.find((p) => p.oneShot)!]) {
      storage.put({ id: pack.name, name: pack.name, code: pack.levels[2], created: 1, updated: 1 });
    }
    for (const r of libraryRows(storage, {})) expect(r.pack).toBe(r.name);
  });
});
