import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, portCell, portCount, portEnd, portId, type Puzzle } from '../src/model';
import { canPlace, checkSolution } from '../src/rules';
import { pathEdges } from './helpers';

const snake3x3: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2],
];

/** Put the path's ends on the frame beside these tiles. */
function endsAt(p: Puzzle, a: number, b: number) {
  const port = (c: number) => Array.from({ length: portCount(p) }, (_, i) => i).find((i) => portCell(p, i) === c)!;
  p.endpoints = [portEnd(port(a)), portEnd(port(b))];
}

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
    endsAt(p, 0, 8);
    const r = checkSolution(p, pathEdges(p, snake3x3));
    expect(r.solved).toBe(true);
  });

  test('reports unvisited tiles', () => {
    const p = createPuzzle(3, 3);
    endsAt(p, 0, 8);
    const r = checkSolution(p, pathEdges(p, snake3x3.slice(0, 7)));
    expect(r.solved).toBe(false);
    expect([...r.unvisited].sort()).toEqual([7, 8]);
  });

  test('black tiles do not need visiting', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(8);
    endsAt(p, 0, 7);
    expect(checkSolution(p, pathEdges(p, snake3x3.slice(0, 8))).solved).toBe(true);
  });

  test('rejects a loop', () => {
    const p = createPuzzle(2, 2);
    endsAt(p, 0, 1);
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]], true));
    expect(r.solved).toBe(false);
    expect(r.loopEdges.size).toBe(4);
  });

  test('rejects branches', () => {
    const p = createPuzzle(3, 2);
    endsAt(p, 0, 2);
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
  });

  test('rejects two separate pieces', () => {
    const p = createPuzzle(4, 1);
    endsAt(p, 0, 3);
    const r = checkSolution(p, pathEdges(p, [[0, 0], [0, 1]]).add(edgeBetween(p, 2, 3)));
    expect(r.solved).toBe(false);
    expect(r.pieces).toBe(2);
  });
});

describe('checkSolution — no ends', () => {
  test('a puzzle without ends takes any path through every tile, but never a loop', () => {
    const p = createPuzzle(2, 3);
    const tour = [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0]] as [number, number][];
    expect(checkSolution(p, pathEdges(p, tour)).solved).toBe(true);
    const r = checkSolution(p, pathEdges(p, tour, true));
    expect(r.solved).toBe(false);
    expect(r.loopEdges.size).toBe(6);
  });
});
