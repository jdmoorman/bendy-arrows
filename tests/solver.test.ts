import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, edgeCount, isUsableEdge, portCount, portEnd, portId, endsEqual, type Puzzle } from '../src/model';
import { checkSolution } from '../src/rules';
import { parityCheck, solve } from '../src/solver';
import { decodePuzzle } from '../src/codec';
import { endsBottomRight } from './helpers';

/** Count solutions by checking every subset of usable edges. */
function bruteForceCount(p: Puzzle): number {
  const free: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) if (isUsableEdge(p, e)) free.push(e);
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
  test('open 3x3 path must end on A tiles', () => {
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(0)];
    expect(parityCheck(p).endColor).toBe(0);
    p.endpoints = [portEnd(portId(p, 'top', 1))];
    expect(parityCheck(p).ok).toBe(false);
  });
});

describe('solve', () => {
  test('a 1xN strip has a unique path', () => {
    const strip = createPuzzle(5, 1);
    strip.endpoints = [portEnd(0)];
    const r = solve(strip);
    expect(r.status).toBe('unique');
    expect(r.solutions[0]).toHaveLength(4);
  });

  test('open 2x3 path has multiple solutions', () => {
    const p = createPuzzle(3, 2);
    p.endpoints = [portEnd(0)];
    expect(solve(p).status).toBe('multiple');
  });

  test('open 2x3 with ends side by side is unique', () => {
    expect(solve(endsBottomRight(3, 2)).status).toBe('unique');
  });

  test('ends on the wrong colours report none with a reason', () => {
    const r = solve(endsBottomRight(3, 3));
    expect(r.status).toBe('none');
    expect(r.reason).toMatch(/both path ends must be on A tiles/);
  });

  test('endpoints make a 2x2 path unique', () => {
    const p = createPuzzle(2, 2);
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 0))];
    const r = solve(p);
    expect(r.status).toBe('unique');
    expect(checkSolution(p, r.solutions[0]).solved).toBe(true);
  });

  test('walls can force uniqueness', () => {
    // 3x3 path; walls create a comb that only allows the snake.
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(0)];
    p.walls.add(edgeBetween(p, 3, 4)).add(edgeBetween(p, 4, 7)).add(edgeBetween(p, 1, 4));
    p.walls.add(edgeBetween(p, 0, 3));
    const r = solve(p);
    expect(r.status).not.toBe('aborted');
    expect(r.solutions.every((s) => checkSolution(p, s).solved)).toBe(true);
  });

  test('aborts when over the node budget', () => {
    const p = createPuzzle(8, 8);
    p.endpoints = [portEnd(0)];
    const r = solve(p, { nodeLimit: 1000, maxSolutions: 1e9 });
    expect(r.status).toBe('aborted');
  });

  test('matches brute force on random small puzzles', () => {
    const rand = rng(42);
    for (let trial = 0; trial < 300; trial++) {
      const w = 2 + Math.floor(rand() * 3);
      const h = 2 + Math.floor(rand() * 2);
      const p = createPuzzle(w, h);
      const n = w * h;
      for (let c = 0; c < n; c++) if (rand() < 0.12) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) {
        if (rand() < 0.12) p.walls.add(e);
      }
      // 0, 1 or 2 fixed ends (the rest are free).
      const k = Math.floor(rand() * 3);
      for (let i = 0; i < k; i++) {
        const end = portEnd(Math.floor(rand() * portCount(p)));
        if (!p.endpoints.some((e) => endsEqual(e, end))) p.endpoints.push(end);
      }
      const expected = bruteForceCount(p);
      const r = solve(p, { maxSolutions: 1e9 });
      const ctx = JSON.stringify({ trial, w, h, blocked: [...p.blocked], walls: [...p.walls], endpoints: p.endpoints });
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

describe('solve with required segments', () => {
  test('finds a solution that uses the given segments, or none if they are wrong', async () => {
    const { decodePuzzle } = await import('../src/codec');
    const { SAMPLES } = await import('../src/samples');
    const p = decodePuzzle(SAMPLES[0].code);
    const sol = solve(p).solutions[0];
    const some = sol.filter((_, i) => i % 3 === 0);
    expect(solve(p, { mustUse: some, maxSolutions: 1 }).solutions).toHaveLength(1);
    // A usable segment that is not in the unique solution.
    const wrong = Array.from({ length: edgeCount(p) }, (_, e) => e).find((e) => isUsableEdge(p, e) && !sol.includes(e))!;
    expect(solve(p, { mustUse: [...some, wrong], maxSolutions: 1 }).status).toBe('none');
  });

  test('matches brute force on random small puzzles with required segments', () => {
    let seed = 99;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 200; trial++) {
      const p = createPuzzle(2 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 2));
      if (rand() < 0.5) p.endpoints = [portEnd(Math.floor(rand() * portCount(p))), portEnd(Math.floor(rand() * portCount(p)))];
      if (p.endpoints.length === 2 && p.endpoints[0].port === p.endpoints[1].port) p.endpoints = [];
      const must: number[] = [];
      for (let e = 0; e < edgeCount(p); e++) if (rand() < 0.15) must.push(e);
      const all = solve(p, { maxSolutions: 1e9 }).solutions;
      const expected = all.filter((s) => must.every((e) => s.includes(e))).length;
      expect(solve(p, { mustUse: must, maxSolutions: 1e9 }).solutions.length, `trial ${trial}`).toBe(expected);
    }
  });
});

describe('solutionUnion', async () => {
  const { solutionUnion } = await import('../src/solver');
  /** The union of every solution, by listing them all (small boards only). */
  const bruteUnion = (p: Puzzle) => [...new Set(solve(p, { maxSolutions: 1e9 }).solutions.flat())].sort((a, b) => a - b);
  const cases: [string, () => Puzzle][] = [
    ['open 4×4, ends side by side', () => endsBottomRight(4, 4)],
    ['4×3 path between two corners', () => {
      const p = createPuzzle(4, 3);
      p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 2))];
      return p;
    }],
    ['5×4, ends side by side, with a wall', () => {
      const p = endsBottomRight(5, 4);
      p.walls.add(edgeBetween(p, 6, 7));
      return p;
    }],
  ];
  for (const [name, make] of cases) {
    test(`finds every line of every solution: ${name}`, () => {
      const p = make();
      const u = solutionUnion(p);
      expect(u.unchecked).toEqual([]);
      expect([...u.edges].sort((a, b) => a - b)).toEqual(bruteUnion(p));
    });
  }
  test('a unique puzzle gives just its solution, and an impossible one gives nothing', () => {
    const p = endsBottomRight(2, 2);
    expect(solutionUnion(p)).toMatchObject({ status: 'unique', unchecked: [] });
    expect(solutionUnion(p).edges).toHaveLength(3);
    const q = endsBottomRight(3, 3); // the ends are on different colours, but must both be on the commoner one
    expect(solutionUnion(q)).toEqual({ status: 'none', edges: [], unchecked: [], suggestedWall: null });
  });
});

describe('seeded solving', () => {
  test('a seed changes which solution comes first, never whether it is valid', () => {
    const p = createPuzzle(6, 6);
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const r = solve(p, { maxSolutions: 1, seed });
      expect(r.solutions).toHaveLength(1);
      expect(checkSolution(p, new Set(r.solutions[0])).solved).toBe(true);
      firsts.add(r.solutions[0].join(','));
    }
    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe('suggested wall', async () => {
  const { solutionUnion } = await import('../src/solver');
  test('rules out the most solutions found, but never all of them', () => {
    const p = endsBottomRight(4, 4); // several paths
    const u = solutionUnion(p);
    expect(u.suggestedWall).not.toBeNull();
    const s = u.suggestedWall!;
    expect(s.rulesOut).toBeGreaterThan(0);
    expect(s.rulesOut).toBeLessThan(s.found);
    // Walling it off really leaves some solutions and removes the ones that used it.
    const all = solve(p, { maxSolutions: 1e9 }).solutions;
    const q = endsBottomRight(4, 4);
    q.walls.add(s.edge);
    const left = solve(q, { maxSolutions: 1e9 }).solutions;
    expect(left.length).toBe(all.filter((sol) => !sol.includes(s.edge)).length);
    expect(left.length).toBeGreaterThan(0);
  });
  test('a unique puzzle gets no suggestion', () => {
    expect(solutionUnion(endsBottomRight(2, 2)).suggestedWall).toBeNull();
  });
});

describe('logic first', () => {
  // A mostly open 8×14 board: the search alone takes very long, the logic rules solve it at once.
  const open = decodePuzzle('Bjtk1GcAUP_yMA');
  test('a puzzle the rules solve is unique without searching', () => {
    const r = solve(open);
    expect(r.status).toBe('unique');
    expect(r.nodes).toBe(0);
    expect(checkSolution(open, new Set(r.solutions[0])).solved).toBe(true);
  });

  test('and it gets a rating', async () => {
    const { rateDifficulty } = await import('../src/generator');
    expect(rateDifficulty(open)).toBe('easy');
  });
});
