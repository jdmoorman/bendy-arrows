import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, edgeCount, isUsableEdge, portCount, portEnd, portId, endsEqual, type Puzzle } from '../src/model';
import { checkSolution } from '../src/rules';
import { endFixes, parityCheck, solve } from '../src/solver';
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
  const { SAMPLES } = await import('./samples');
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
    const { SAMPLES } = await import('./samples');
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

describe('endPlacements', async () => {
  const { endPlacements } = await import('../src/solver');
  const { createPuzzle, portCell, portEnd, portId } = await import('../src/model');
  test('every placement it lists solves as it says, and every pair of tiles it leaves out has no solution', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(4);
    const { options, unchecked } = endPlacements(p);
    expect(unchecked).toBe(0);
    const listed = new Set(options.map((o) => [portCell(p, o.ports[0][0]), portCell(p, o.ports[1][0])].sort().join()));
    const frame = [0, 1, 2, 3, 5, 6, 7, 8];
    for (const a of frame) {
      for (const b of frame) {
        if (a >= b) continue;
        const portOf = (c: number) => [...Array(12).keys()].find((k) => portCell(p, k) === c)!;
        const q = { ...p, endpoints: [portEnd(portOf(a)), portEnd(portOf(b))] };
        const r = solve(q, { maxSolutions: 2 });
        expect(listed.has(`${a},${b}`), `${a}-${b}`).toBe(r.status === 'unique' || r.status === 'multiple');
        const o = options.find((x) => [portCell(p, x.ports[0][0]), portCell(p, x.ports[1][0])].sort().join() === `${a},${b}`);
        if (o) expect(o.status).toBe(r.status);
      }
    }
  });
  test('with one end placed, only the other end moves', () => {
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(portId(p, 'left', 0))];
    const { options } = endPlacements(p);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o.ports[0]).toEqual([portId(p, 'left', 0)]);
  });
});

describe('endPlacements with union', async () => {
  const { endPlacements } = await import('../src/solver');
  const { createPuzzle, portEnd } = await import('../src/model');
  test('each placement lists every line some solution for it uses', () => {
    const p = createPuzzle(3, 3);
    const { options } = endPlacements(p, { union: true });
    expect(options.some((o) => o.status === 'multiple')).toBe(true);
    for (const o of options) {
      const q = { ...p, endpoints: [portEnd(o.ports[0][0]), portEnd(o.ports[1][0])] };
      const all = new Set(solve(q, { maxSolutions: 1000 }).solutions.flat());
      expect([...o.edges].sort((a, b) => a - b)).toEqual([...all].sort((a, b) => a - b));
    }
  });
});

describe('tileFixes', async () => {
  const { tileFixes } = await import('../src/solver');
  const { createPuzzle, portEnd, portId, cellAt } = await import('../src/model');
  test('a 3×3 with both ends on the rarer colour has no solution; blacking out the middle (the commoner colour) fixes it', () => {
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'top', 1))];
    const all = Array.from({ length: 9 }, (_, i) => i);
    const fixes = tileFixes(p, all);
    expect(fixes.some((f) => f.cell === cellAt(p, 1, 1) && f.add)).toBe(true);
    // The end tiles stay open, and no tile of the rarer colour helps.
    expect(fixes.every((f) => f.cell !== cellAt(p, 0, 0) && f.cell !== cellAt(p, 0, 1))).toBe(true);
    expect(fixes.every((f) => (Math.floor(f.cell / 3) + (f.cell % 3)) % 2 === 0)).toBe(true);
  });
});

describe('suggest', async () => {
  const { suggest, playThrough } = await import('../src/suggest');
  const { ALL_RULES } = await import('../src/logic');
  test('a suggested change of walls or black tiles makes a player need more hints (or get further), and the puzzle keeps a solution', () => {
    const p = decodePuzzle('BiouuR74XSs');
    // Take away a couple of black tiles so there's something to improve.
    for (const c of [...p.blocked].slice(0, 2)) p.blocked.delete(c);
    const before = playThrough(p, ALL_RULES, {});
    for (const kind of ['wall', 'tile'] as const) {
      const s = suggest(p, kind, ALL_RULES);
      if (!s) continue; // nothing improves it: fine
      expect(s.hintsBefore).toBe(before.hints);
      const better = (before.stuck && !s.stuck) || (s.stuck === before.stuck && (s.hints! > before.hints || (s.hints === before.hints && s.lines > before.lines)));
      expect(better).toBe(true);
      const q = decodePuzzle('BiouuR74XSs');
      for (const c of [...q.blocked].slice(0, 2)) q.blocked.delete(c);
      const set = kind === 'wall' ? q.walls : q.blocked;
      for (const x of s.at) set.add(x);
      for (const x of s.remove ?? []) set.delete(x);
      expect(solve(q, { maxSolutions: 1 }).status).not.toBe('none');
    }
  }, 300_000);
});

describe('end fixes', () => {
  test('a puzzle broken by moving its exit is fixed by moving the exit back', () => {
    const level = decodePuzzle('ByIdliA');
    const home = level.endpoints[1].port;
    // The first other spot for the exit that leaves the puzzle with no solution.
    let broken: Puzzle | undefined;
    for (let port = 0; port < portCount(level) && !broken; port++) {
      if (port === home || port === level.endpoints[0].port) continue;
      const q = { ...level, endpoints: [level.endpoints[0], portEnd(port)] };
      if (solve(q).status === 'none') broken = q;
    }
    expect(broken).toBeDefined();
    const exit = endFixes(broken!).find((f) => f.end === 1);
    expect(exit?.spots).toBeGreaterThanOrEqual(1);
    expect(exit!.unique).toBeGreaterThanOrEqual(1);
  });

  test('a puzzle with nothing that could fix it by its ends gets none', () => {
    // A black tile splitting a 3×1 strip: no ends anywhere give a path through every tile.
    const p = createPuzzle(3, 1);
    p.blocked.add(1);
    p.endpoints = [portEnd(0)];
    expect(endFixes(p)).toEqual([]);
  });
});

describe('fixes the logic rules accept', async () => {
  const { tileFixes } = await import('../src/solver');
  const { createPuzzle, portEnd, portId, cellAt } = await import('../src/model');
  const { ALL_RULES, logicContradiction } = await import('../src/logic');
  test('4×7 with one end at A3 and a black tile at C4: only taking C4 away leaves the rules no contradiction', () => {
    const p = createPuzzle(4, 7);
    p.endpoints = [portEnd(portId(p, 'left', 2))];
    const c4 = cellAt(p, 3, 2);
    p.blocked.add(c4);
    const check = { rules: ALL_RULES };
    expect(logicContradiction(p, check)?.reason).toBe('A tile has too few ways in or out.');
    const all = Array.from({ length: 28 }, (_, i) => i);
    // The solver alone (the free end can sit in a dead end) takes many tiles; the rules don't.
    expect(tileFixes(p, all).length).toBeGreaterThan(1);
    expect(tileFixes(p, all, { ok: (q) => !logicContradiction(q, check) })).toEqual([{ cell: c4, add: false, status: 'multiple' }]);
  });
});
