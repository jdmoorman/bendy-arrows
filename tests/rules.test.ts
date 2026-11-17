import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, portEnd, portId } from '../src/model';
import { canPlace, checkSolution } from '../src/rules';
import { pathEdges } from './helpers';

const snake3x3: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2],
];

describe('canPlace', () => {
  test('blocks only black tiles and walls', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(4);
    p.walls.add(edgeBetween(p, 0, 1));
    expect(canPlace(p, edgeBetween(p, 0, 1))).toBe(false);
    expect(canPlace(p, edgeBetween(p, 1, 4))).toBe(false);
    expect(canPlace(p, edgeBetween(p, 1, 2))).toBe(true);
  });
});

describe('checkSolution — path mode', () => {
  test('accepts a snake through every tile', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 8];
    const r = checkSolution(p, pathEdges(p, snake3x3));
    expect(r.solved).toBe(true);
  });

  test('reports unvisited tiles', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 8];
    const r = checkSolution(p, pathEdges(p, snake3x3.slice(0, 7)));
    expect(r.solved).toBe(false);
    expect([...r.unvisited].sort()).toEqual([7, 8]);
  });

  test('black tiles do not need visiting', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(8);
    p.checkpoints = [0, 7];
    expect(checkSolution(p, pathEdges(p, snake3x3.slice(0, 8))).solved).toBe(true);
  });

  test('rejects a loop', () => {
    const p = createPuzzle(2, 2);
    p.checkpoints = [0, 1];
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]], true));
    expect(r.solved).toBe(false);
    expect(r.loopEdges.size).toBe(4);
  });

  test('rejects branches', () => {
    const p = createPuzzle(3, 2);
    p.checkpoints = [0, 2];
    const segs = pathEdges(p, [[0, 0], [0, 1], [0, 2]]);
    segs.add(edgeBetween(p, 1, 4));
    segs.add(edgeBetween(p, 3, 4));
    segs.add(edgeBetween(p, 4, 5));
    const r = checkSolution(p, segs);
    expect(r.solved).toBe(false);
    expect(r.branches.has(1) || r.branches.has(4)).toBe(true);
  });

  test('enforces fixed endpoints', () => {
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(portId(p, 'top', 0)), portEnd(portId(p, 'top', 2))];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(false);
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'bottom', 2))];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(true);
    p.endpoints = [portEnd(portId(p, 'right', 2))];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(true);
    // Checkpoints at the ends work like tile ends.
    p.endpoints = [];
    p.checkpoints = [0, 8];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(true);
    p.endpoints = [];
    p.checkpoints = [4, 8];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(false);
  });

  test('rejects two separate pieces', () => {
    const p = createPuzzle(4, 1);
    p.checkpoints = [0, 3];
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1]]).add(edgeBetween(p, 2, 3)));
    expect(r.solved).toBe(false);
    expect(r.pieces).toBe(2);
  });
});

describe('checkSolution — checkpoints', () => {
  test('a path through the numbers in order is solved', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 4, 8];
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(true);
  });

  test('numbers visited out of order are reported', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 6, 4, 8]; // the snake reaches 4 before 6
    const r = checkSolution(p, pathEdges(p, snake3x3));
    expect(r.solved).toBe(false);
    expect(r.checkpointErrors.size).toBeGreaterThan(0);
    expect(r.message).toMatch(/order/);
  });

  test('the path must start at 1 and end at the highest number', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [8, 0]; // reversed: still the same path, so it is fine
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(true);
    p.checkpoints = [0, 7]; // 7 is not an end of the snake
    expect(checkSolution(p, pathEdges(p, snake3x3)).solved).toBe(false);
  });
});

describe('checkSolution — cycle mode', () => {
  test('a puzzle without ends is a loop, so an open path is not a solution', () => {
    const p = createPuzzle(3, 3);
    const r = checkSolution(p, pathEdges(p, snake3x3));
    expect(r.solved).toBe(false);
    expect([...r.badEnds].sort()).toEqual([0, 8]);
    const q = createPuzzle(2, 3);
    expect(checkSolution(q, pathEdges(q, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0]])).solved).toBe(false);
  });

  test('accepts a loop through every tile', () => {
    const p = createPuzzle(2, 3);
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0]], true));
    expect(r.solved).toBe(true);
  });

  test('rejects an open path', () => {
    const p = createPuzzle(2, 3);
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0]]));
    expect(r.solved).toBe(false);
    expect(r.badEnds.size).toBe(2);
  });

  test('rejects a premature loop', () => {
    const p = createPuzzle(2, 3);
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]], true));
    expect(r.solved).toBe(false);
    expect(r.loopEdges.size).toBe(4);
  });
});
