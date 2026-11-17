import { describe, expect, test } from 'vitest';
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
  test('put, list (newest first), remove', () => {
    const s = new Storage(new MemStore());
    s.put(entry('a', 1));
    s.put(entry('b', 2));
    expect(s.list().map((e) => e.id)).toEqual(['b', 'a']);
    s.remove('b');
    expect(s.list().map((e) => e.id)).toEqual(['a']);
    expect(s.findByCode('CODEa')?.id).toBe('a');
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
    m.setItem('hamiltonian.library.v1', '{not json');
    expect(new Storage(m).list()).toEqual([]);
  });

  test('session round-trip', () => {
    const s = new Storage(new MemStore());
    s.saveSession({ code: 'X', progress: { segments: [2], xMarks: [3] }, tab: 'edit' });
    expect(s.loadSession()).toEqual({ code: 'X', progress: { segments: [2], xMarks: [3] }, tab: 'edit' });
  });
});
