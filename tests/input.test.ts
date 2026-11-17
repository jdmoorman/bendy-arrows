import { describe, expect, test } from 'vitest';
import { hitTest, stepToward } from '../src/input';
import { createPuzzle, edgeBetween } from '../src/model';
import { History } from '../src/history';

describe('hitTest', () => {
  const p = createPuzzle(3, 3);
  test('centre of a tile hits the tile only', () => {
    expect(hitTest(p, 1.5, 1.5)).toEqual({ cell: 4, edge: -1, edgeDist: Infinity });
  });
  test('near a border hits that border', () => {
    expect(hitTest(p, 1.95, 1.5)!.edge).toBe(edgeBetween(p, 4, 5));
    expect(hitTest(p, 1.5, 0.97)!.edge).toBe(edgeBetween(p, 1, 4));
  });
  test('outer borders are ignored', () => {
    expect(hitTest(p, 0.02, 0.5)!.edge).toBe(-1);
    expect(hitTest(p, 0.02, 0.5, Infinity)!.edge).toBe(edgeBetween(p, 0, 3));
  });
  test('outside the grid is null', () => {
    expect(hitTest(p, -0.1, 1)).toBeNull();
    expect(hitTest(p, 3, 1)).toBeNull();
  });
});

describe('stepToward', () => {
  const p = createPuzzle(4, 4);
  test('moves along the longer axis first', () => {
    expect(stepToward(p, 0, 7)).toBe(1); // (0,0)->(1,3)
    expect(stepToward(p, 0, 12)).toBe(4); // straight down
  });
});

describe('History', () => {
  test('undo/redo', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeUndefined();
    expect(h.redo(1)).toBe(2);
    h.push(5);
    expect(h.canRedo).toBe(false);
  });
});
