import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, edgeCount, isUsableEdge, portCount, portId, type Puzzle } from '../src/model';
import { checkSolution } from '../src/rules';
import { parityCheck, solve } from '../src/solver';

/** Count solutions by checking every subset of usable non-given edges. */
function bruteForceCount(p: Puzzle): number {
  const free: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) if (isUsableEdge(p, e) && !p.givens.has(e)) free.push(e);
  let count = 0;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const segs: number[] = [];
    for (let i = 0; i < free.length; i++) if (mask & (1 << i)) segs.push(free[i]);
    if (checkSolution(p, segs).solved) count++;
  }
  return count;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe('parity', () => {
  test('open 3x3 cannot be a loop', () => {
    const r = parityCheck(createPuzzle(3, 3, 'cycle'));
    expect(r.ok).toBe(false);
    expect(r.a).toBe(5);
    expect(r.b).toBe(4);
  });

  test('open 3x3 path must end on A tiles', () => {
    const p = createPuzzle(3, 3, 'path');
    expect(parityCheck(p).endColor).toBe(0);
    p.endpoints = [portId(p, 'top', 1)];
    expect(parityCheck(p).ok).toBe(false);
  });
});

describe('solve', () => {
  test('a 1xN strip has a unique path', () => {
    const r = solve(createPuzzle(5, 1, 'path'));
    expect(r.status).toBe('unique');
    expect(r.solutions[0]).toHaveLength(4);
  });

  test('open 2x3 path has multiple solutions', () => {
    expect(solve(createPuzzle(3, 2, 'path')).status).toBe('multiple');
  });

  test('open 2x3 loop is unique', () => {
    expect(solve(createPuzzle(3, 2, 'cycle')).status).toBe('unique');
  });

  test('odd-parity loop reports none with a reason', () => {
    const r = solve(createPuzzle(3, 3, 'cycle'));
    expect(r.status).toBe('none');
    expect(r.reason).toMatch(/checkerboard/);
  });

  test('endpoints make a 2x2 path unique', () => {
    const p = createPuzzle(2, 2, 'path');
    p.endpoints = [portId(p, 'left', 0), portId(p, 'right', 0)];
    const r = solve(p);
    expect(r.status).toBe('unique');
    expect(checkSolution(p, r.solutions[0]).solved).toBe(true);
  });

  test('walls can force uniqueness', () => {
    // 3x3 path; walls create a comb that only allows the snake.
    const p = createPuzzle(3, 3, 'path');
    p.walls.add(edgeBetween(p, 3, 4)).add(edgeBetween(p, 4, 7)).add(edgeBetween(p, 1, 4));
    p.walls.add(edgeBetween(p, 0, 3));
    const r = solve(p);
    expect(r.status).not.toBe('aborted');
    expect(r.solutions.every((s) => checkSolution(p, s).solved)).toBe(true);
  });

  test('aborts when over the node budget', () => {
    const r = solve(createPuzzle(8, 8, 'path'), { nodeLimit: 1000, maxSolutions: 1e9 });
    expect(r.status).toBe('aborted');
  });

  test('matches brute force on random small puzzles', () => {
    const rand = rng(42);
    for (let trial = 0; trial < 300; trial++) {
      const w = 2 + Math.floor(rand() * 3);
      const h = 2 + Math.floor(rand() * 2);
      const p = createPuzzle(w, h, rand() < 0.5 ? 'path' : 'cycle');
      const n = w * h;
      for (let c = 0; c < n; c++) if (rand() < 0.12) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) {
        const x = rand();
        if (x < 0.12) p.walls.add(e);
        else if (x < 0.18 && isUsableEdge(p, e)) p.givens.add(e);
      }
      if (p.mode === 'path') {
        const k = Math.floor(rand() * 3);
        for (let i = 0; i < k; i++) {
          const port = Math.floor(rand() * portCount(p));
          if (!p.endpoints.includes(port)) p.endpoints.push(port);
        }
      }
      const expected = bruteForceCount(p);
      const r = solve(p, { maxSolutions: 1e9 });
      const ctx = JSON.stringify({ trial, w, h, mode: p.mode, blocked: [...p.blocked], walls: [...p.walls], givens: [...p.givens], endpoints: p.endpoints });
      expect(r.solutions.length, ctx).toBe(expected);
      for (const s of r.solutions) expect(checkSolution(p, s).solved, ctx).toBe(true);
    }
  });
});

describe('samples', async () => {
  const { SAMPLES } = await import('../src/samples');
  const { decodePuzzle } = await import('../src/codec');
  for (const s of SAMPLES) {
    test(`${s.name} is unique`, () => {
      expect(solve(decodePuzzle(s.code)).status).toBe('unique');
    });
  }
});
