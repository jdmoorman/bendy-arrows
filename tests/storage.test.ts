import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
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

const entry = (id: string, updated: number) => ({ id, name: id, code: 'CODE' + id, created: 0, updated });

describe('Storage', () => {
  test('stored 0.5 codes are rewritten in the current format, once', () => {
    const old = 'BQQKCgAEAAwAAAAAkAiAAAAgCAAAIAABCEAAAAAAAIAAAAJAAAABAkAAEA';
    const now = encodePuzzle(decodePuzzle(old));
    const store = new MemStore();
    store.setItem('bendyarrows.library.v1', JSON.stringify([{ id: 'a', name: 'a', code: old, created: 0, updated: 0 }, entry('b', 1)]));
    store.setItem('bendyarrows.solved.v1', JSON.stringify([old]));
    store.setItem('bendyarrows.ratings.v1', JSON.stringify({ [old]: { difficulty: 'hard', unique: true } }));
    store.setItem('bendyarrows.session.v1', JSON.stringify({ code: old, editorCode: old, progress: { segments: [], xMarks: [] } }));
    const s = new Storage(store);
    expect(s.findByCode(now)?.id).toBe('a');
    expect(s.findByCode('CODEb')?.id).toBe('b'); // not a real code: left alone
    expect(s.isSolved(now)).toBe(true);
    expect(s.loadRatings()[now]).toEqual({ difficulty: 'hard', unique: true });
    expect(s.loadSession()).toMatchObject({ code: now, editorCode: now });
    // Done once: an old code saved afterwards stays as it is.
    store.setItem('bendyarrows.solved.v1', JSON.stringify([old]));
    expect(new Storage(store).isSolved(old)).toBe(true);
  });

  test('put, list (newest first), remove', () => {
    const s = new Storage(new MemStore());
    s.put(entry('a', 1));
    s.put(entry('b', 2));
    expect(s.list().map((e) => e.id)).toEqual(['b', 'a']);
    s.remove('b');
    expect(s.list().map((e) => e.id)).toEqual(['a']);
    expect(s.findByCode('CODEa')?.id).toBe('a');
  });

  test('removeMany deletes several entries at once', () => {
    const s = new Storage(new MemStore());
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) s.put(entry(id, i));
    s.removeMany(['a', 'c', 'zz']);
    expect(s.list().map((e) => e.id)).toEqual(['d', 'b']);
  });

  test('progress only updates the matching puzzle', () => {
    const s = new Storage(new MemStore());
    s.put(entry('a', 1));
    s.updateProgress('a', 'OTHER', { segments: [1], xMarks: [] }, false);
    expect(s.get('a')?.progress).toBeUndefined();
    s.updateProgress('a', 'CODEa', { segments: [1], xMarks: [] }, true);
    expect(s.get('a')?.progress?.segments).toEqual([1]);
    expect(s.get('a')?.solved).toBe(true);
  });

  test('survives broken or missing storage', () => {
    const broken: KeyValueStore = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    const s = new Storage(broken);
    expect(s.list()).toEqual([]);
    expect(s.put(entry('a', 1))).toBe(false);
    expect(new Storage(null).loadSession()).toBeNull();
    const m = new MemStore();
    m.setItem('bendyarrows.library.v1', '{not json');
    expect(new Storage(m).list()).toEqual([]);
  });

  test('session round-trip', () => {
    const s = new Storage(new MemStore());
    s.saveSession({ code: 'X', progress: { segments: [2], xMarks: [3] }, tab: 'edit' });
    expect(s.loadSession()).toEqual({ code: 'X', progress: { segments: [2], xMarks: [3] }, tab: 'edit' });
  });
});

describe('settings', () => {
  test('default to checkerboard on and round-trip', () => {
    const s = new Storage(new MemStore());
    expect(s.loadSettings()).toEqual({ checkerboard: true, autoCheck: true, darkTheme: false, coordinates: false });
    s.saveSettings({ checkerboard: false, autoCheck: false, darkTheme: true, coordinates: true });
    expect(s.loadSettings()).toEqual({ checkerboard: false, autoCheck: false, darkTheme: true, coordinates: true });
    expect(new Storage(null).loadSettings()).toEqual({ checkerboard: true, autoCheck: true, darkTheme: false, coordinates: false });
  });

});

describe('solved puzzles', () => {
  test('markSolved and isSolved', () => {
    const s = new Storage(new MemStore());
    expect(s.isSolved('A')).toBe(false);
    s.markSolved('A');
    s.markSolved('A');
    expect(s.isSolved('A')).toBe(true);
    expect(s.isSolved('B')).toBe(false);
  });

  test('puzzles with old solve times count as solved', () => {
    const m = new MemStore();
    m.setItem('hamiltonian.times.v1', JSON.stringify({ A: [{ ms: 1000, at: 0 }] }));
    const s = new Storage(m);
    expect(s.isSolved('A')).toBe(true);
    s.markSolved('B');
    expect(s.isSolved('A')).toBe(true);
    expect(s.isSolved('B')).toBe(true);
  });
});

describe('rename from Hamiltonian', () => {
  test('data under the old keys carries over, without overwriting new data', () => {
    const m = new MemStore();
    m.setItem('hamiltonian.library.v1', JSON.stringify([entry('a', 1)]));
    m.setItem('hamiltonian.settings.v1', JSON.stringify({ darkTheme: true }));
    m.setItem('bendyarrows.settings.v1', JSON.stringify({ darkTheme: false }));
    const s = new Storage(m);
    expect(s.list().map((e) => e.id)).toEqual(['a']);
    expect(s.loadSettings().darkTheme).toBe(false);
  });
});
