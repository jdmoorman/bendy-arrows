import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, edgeCells, edgeCount, neighbors, portCell, portCount, portEnd, portId, portSide, resizePuzzle } from '../src/model';

describe('model', () => {
  test('edge ids round-trip through edgeCells/edgeBetween', () => {
    const s = { w: 4, h: 3 };
    expect(edgeCount(s)).toBe(3 * 3 + 2 * 4);
    for (let e = 0; e < edgeCount(s); e++) {
      const [a, b] = edgeCells(s, e);
      expect(edgeBetween(s, a, b)).toBe(e);
      expect(edgeBetween(s, b, a)).toBe(e);
    }
  });

  test('non-adjacent cells have no edge', () => {
    const s = { w: 3, h: 3 };
    expect(edgeBetween(s, 2, 3)).toBe(-1); // wraps a row
    expect(edgeBetween(s, 0, 4)).toBe(-1); // diagonal
  });

  test('neighbors respect borders', () => {
    const s = { w: 3, h: 2 };
    expect(neighbors(s, 0).sort()).toEqual([1, 3]);
    expect(neighbors(s, 4).sort()).toEqual([1, 3, 5]);
  });

  test('resize keeps features inside the new bounds', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(8); // (2,2)
    p.blocked.add(4); // (1,1)
    p.walls.add(edgeBetween(p, 0, 1));
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 2))];
    const q = resizePuzzle(p, 2, 2);
    expect([...q.blocked]).toEqual([3]);
    expect([...q.walls]).toEqual([edgeBetween(q, 0, 1)]);
    expect(q.endpoints).toEqual([portEnd(portId(q, 'left', 0))]);
    p.endpoints = [];
    p.blocked.clear();
    p.checkpoints = [8, 3, 1]; // (2,2) dropped; the rest keep their order
    expect(resizePuzzle(p, 2, 2).checkpoints).toEqual([2, 1]);
  });

  test('ports cover the frame clockwise and map to edge tiles', () => {
    const s = { w: 3, h: 2 };
    expect(portCount(s)).toBe(10);
    const cells = Array.from({ length: 10 }, (_, i) => portCell(s, i));
    expect(cells).toEqual([0, 1, 2, 2, 5, 3, 4, 5, 0, 3]);
    for (let i = 0; i < 10; i++) {
      const [side, k] = portSide(s, i);
      expect(portId(s, side, k)).toBe(i);
    }
  });
});
