import { describe, expect, test } from 'vitest';
import { ALL_RULES, applyStep, BASIC_RULES, logicStep, type LogicState, type RuleId } from '../src/logic';
import { createPuzzle, edgeBetween, edgeCount, endpointCells, isUsableEdge, portEnd, portId, type Puzzle } from '../src/model';
import { solve } from '../src/solver';
import { endsBottomRight, pathEdges } from './helpers';

const board = endsBottomRight;

const empty = (): LogicState => ({ segments: new Set(), xs: new Set() });

function runToEnd(p: Puzzle, rules: RuleId[] = ALL_RULES) {
  let state = empty();
  for (let i = 0; i < 200; i++) {
    const step = logicStep(p, state, rules);
    if (step.contradiction) return { state, contradiction: step.contradiction, solved: false };
    if (step.solved) return { state, solved: true };
    if (!step.segments.length && !step.xs.length) return { state, solved: false };
    state = applyStep(state, step);
  }
  throw new Error('did not settle');
}

describe('logic rules', () => {
  test('corners fill a 2x2 in one step', () => {
    const p = board(2, 2);
    const step = logicStep(p, empty(), ['corners']);
    expect(step.segments).toHaveLength(3);
    expect(step.byRule.corners).toBe(3);
    expect(logicStep(p, applyStep(empty(), step), ['corners']).solved).toBe(true);
  });

  test('passages: a tile walled on opposite sides gets a straight line', () => {
    const p = board(3, 3);
    p.walls.add(edgeBetween(p, 1, 4)).add(edgeBetween(p, 4, 7)); // centre walled top and bottom
    const step = logicStep(p, empty(), ['passages']);
    // The centre, and the top/bottom middle tiles (walled toward the centre), get straight lines.
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 3, 4), edgeBetween(p, 4, 5)]));
    expect(Object.keys(step.byRule)).toEqual(['passages']);
    expect(logicStep(p, empty(), ['corners']).segments.every((e) => e !== edgeBetween(p, 3, 4))).toBe(true);
  });

  test('continue (from the path ends) and passages solve a 1x3 strip with frame ends', () => {
    const p = createPuzzle(3, 1);
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 0))];
    expect(runToEnd(p, ['continue', 'passages']).solved).toBe(true);
    const first = logicStep(p, empty(), ['continue']);
    expect(first.byRule).toEqual({ continue: 2 }); // both end tiles take their only way out
  });

  test('borders of full tiles count as closed without a step', () => {
    // Centre tile 4 has its two lines (left and right); tile 1 above it then has
    // only left and right as ways out, so it is a passage.
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(portId(p, 'bottom', 0)), portEnd(portId(p, 'bottom', 2))];
    const state: LogicState = { segments: new Set([edgeBetween(p, 3, 4), edgeBetween(p, 4, 5)]), xs: new Set() };
    const step = logicStep(p, state, ['passages']);
    expect(step.xs).toEqual([]);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 1), edgeBetween(p, 1, 2)]));
  });

  test('no early loops: the border that would close a loop gets an X', () => {
    const p = board(4, 4);
    const ring = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [1, 2], [1, 1], [1, 0]] as [number, number][];
    const step = logicStep(p, { segments: pathEdges(p, ring), xs: new Set() }, ['noLoops']);
    expect(step.xs).toEqual([edgeBetween(p, 0, 4)]);
  });

  test('no early loops: a loop of 4 or 6 tiles is obvious, so its border needs no X but counts as closed', () => {
    const p = board(4, 4);
    // A U of four tiles in the middle, open at the bottom left (the border 5-9 would close it).
    const state: LogicState = { segments: pathEdges(p, [[2, 1], [1, 1], [1, 2], [2, 2]]), xs: new Set() };
    expect(logicStep(p, state, ['noLoops']).xs).toEqual([]);
    // In a corner, that closed border leaves tile 0 one way out for its two lines: a contradiction.
    const corner: LogicState = { segments: pathEdges(p, [[1, 0], [1, 1], [0, 1], [0, 0]]), xs: new Set() };
    expect(logicStep(p, corner, ['continue']).contradiction).toBeDefined();
  });

  test('no early finish: joining both path ends too soon gets an X', () => {
    const p = createPuzzle(3, 3);
    p.endpoints = [portEnd(portId(p, 'top', 0)), portEnd(portId(p, 'top', 2))];
    const state: LogicState = { segments: new Set([edgeBetween(p, 0, 1)]), xs: new Set() };
    expect(logicStep(p, state, ['noFinish']).xs).toEqual([edgeBetween(p, 1, 2)]);
  });

  test('bottlenecks: an area with two ways in uses both', () => {
    const p = board(4, 4);
    // The top-left 2x2 is reachable only through 1-2 and 4-8.
    p.walls.add(edgeBetween(p, 5, 6)).add(edgeBetween(p, 5, 9));
    const step = logicStep(p, empty(), ['bottlenecks']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 1, 2), edgeBetween(p, 4, 8)]));
  });

  test('checkerboard balance: an area with an extra white tile is entered on white tiles', () => {
    // 3x4, ends low on the right: the top row is white, shaded, white, so the path must enter it on
    // white tiles twice more than on shaded ones: down from both corners, never the middle.
    const p = board(3, 4);
    const step = logicStep(p, empty(), ['balance']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 3), edgeBetween(p, 2, 5)]));
    expect(step.xs).toContain(edgeBetween(p, 1, 4));
  });

  test('checkerboard balance: a balanced area is left on shaded and white tiles equally', () => {
    // 4x4, ends low on the right: the left column (white, shaded, white, shaded) can only be left from
    // its top (white) and bottom (shaded) tiles, so both must be used.
    const p = board(4, 4);
    p.walls.add(edgeBetween(p, 4, 5)).add(edgeBetween(p, 8, 9));
    const step = logicStep(p, empty(), ['balance']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 1), edgeBetween(p, 12, 13)]));
  });

  test('a cut-off area is a contradiction', () => {
    const p = board(4, 2);
    p.walls.add(edgeBetween(p, 1, 2)).add(edgeBetween(p, 5, 6));
    expect(logicStep(p, empty(), ['bottlenecks']).contradiction?.cells?.length).toBe(4);
  });

  test('reports a contradiction', () => {
    const p = board(3, 3);
    p.walls.add(edgeBetween(p, 0, 1)); // corner tile 0 now has one way out but needs two
    expect(logicStep(p, empty(), ALL_RULES).contradiction).toBeTruthy();
  });

  test('never contradicts the unique solution of random puzzles', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let checked = 0;
    for (let trial = 0; trial < 4000 && checked < 80; trial++) {
      const w = 3 + Math.floor(rand() * 3);
      const h = 3 + Math.floor(rand() * 3);
      const p = createPuzzle(w, h);
      for (let c = 0; c < w * h; c++) if (rand() < 0.12) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) if (rand() < 0.15 && isUsableEdge(p, e)) p.walls.add(e);
      {
        const a = Math.floor(rand() * 2 * (w + h));
        const b = Math.floor(rand() * 2 * (w + h));
        if (a !== b) p.endpoints = [portEnd(a), portEnd(b)];
      }
      // Without both ends the rules may go wrong, so only puzzles with both are checked.
      if (endpointCells(p).length < 2) continue;
      const r = solve(p);
      if (r.status !== 'unique') continue;
      checked++;
      const sol = new Set(r.solutions[0]);
      const end = runToEnd(p);
      expect(end.contradiction, `trial ${trial}`).toBeUndefined();
      for (const e of end.state.segments) expect(sol.has(e), `trial ${trial} seg ${e}`).toBe(true);
      for (const e of end.state.xs) expect(sol.has(e), `trial ${trial} x ${e}`).toBe(false);
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('advanced rules', () => {
  test('agree with every solution of random puzzles that have several', () => {
    let seed = 5;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let checked = 0;
    let gained = 0;
    for (let trial = 0; trial < 10000 && checked < 300; trial++) {
      const w = 3 + Math.floor(rand() * 4);
      const h = 3 + Math.floor(rand() * 4);
      const p = createPuzzle(w, h);
      for (let c = 0; c < w * h; c++) if (rand() < 0.05) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) if (rand() < 0.1 && isUsableEdge(p, e)) p.walls.add(e);
      const a = Math.floor(rand() * 2 * (w + h));
      const b = Math.floor(rand() * 2 * (w + h));
      if (a !== b) p.endpoints = [portEnd(a), portEnd(b)];
      if (endpointCells(p).length < 2) continue;
      const r = solve(p, { maxSolutions: 300, nodeLimit: 2e5 });
      if (r.status === 'aborted' || !r.solutions.length || r.solutions.length >= 300) continue;
      checked++;
      const sols = r.solutions.map((x) => new Set(x));
      const end = runToEnd(p);
      const ctx = `trial ${trial}`;
      expect(end.contradiction, ctx).toBeUndefined();
      for (const e of end.state.segments) expect(sols.every((x) => x.has(e)), ctx).toBe(true);
      for (const e of end.state.xs) expect(sols.every((x) => !x.has(e)), ctx).toBe(true);
      const basic = runToEnd(p, BASIC_RULES).state;
      if (end.state.segments.size + end.state.xs.size > basic.segments.size + basic.xs.size) gained++;
    }
    expect(checked).toBe(300);
    expect(gained).toBeGreaterThan(30); // the advanced rules get further than the basic ones
  });

  test('a step on a 30x30 board is quick', () => {
    const p = createPuzzle(30, 30);
    const t = performance.now();
    logicStep(p, empty(), ALL_RULES);
    // About 0.8 s on a laptop. GitHub's shared servers (which set CI) run about twice as slowly,
    // so they get more room: this guards against big slowdowns, not a slow machine.
    const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI;
    expect(performance.now() - t).toBeLessThan(ci ? 4000 : 1000);
  });
});

describe('findHint', async () => {
  const { findHint } = await import('../src/logic');

  test('No early loops measures each application by the piece it would close', async () => {
    const { deductions } = await import('../src/logic');
    const p = board(6, 6);
    const piece = (cells: number[]) => cells.slice(1).map((c, i) => edgeBetween(p, cells[i], c));
    // A 6-tile U at the top and a 4-tile U at the right are obvious (no X); an 8-tile U along the
    // bottom left is not.
    const state: LogicState = {
      segments: new Set([...piece([1, 2, 3, 9, 8, 7]), ...piece([16, 17, 23, 22]), ...piece([24, 25, 26, 27, 33, 32, 31, 30])]),
      xs: new Set(),
    };
    const loops = deductions(p, state, ['noLoops']);
    expect(loops.map((d) => [d.xs[0], d.size])).toEqual([[edgeBetween(p, 24, 30), 8]]);
  });

  test('only uses the rules it is given', () => {
    const p = board(2, 2);
    expect(findHint(p, empty(), ['passages']).kind).toBe('none');
    const h = findHint(p, empty(), ['corners']);
    expect(h.kind === 'deduction' && h.deduction.rule).toBe('corners');
  });

  test('the simplest rule comes first, with an explanation', () => {
    const p = board(2, 2);
    const h = findHint(p, empty());
    expect(h.kind).toBe('deduction');
    if (h.kind !== 'deduction') return;
    expect(h.deduction.rule).toBe('corners');
    expect(h.deduction.cell).toBe(0);
    expect(h.deduction.segments).toHaveLength(2);
    expect(h.text).toMatch(/corner/);
  });

  test('points out a mistake on the board', () => {
    const p = board(3, 3);
    const state: LogicState = { segments: new Set([edgeBetween(p, 4, 1), edgeBetween(p, 4, 3), edgeBetween(p, 4, 5)]), xs: new Set() };
    const h = findHint(p, state);
    expect(h.kind).toBe('mistake');
  });

  test('says so when no simple rule applies', () => {
    const p = board(4, 4); // many solutions: the rules get stuck
    const end = runToEnd(p);
    expect(end.solved).toBe(false);
    const h = findHint(p, end.state);
    expect(h.kind).toBe('none');
    expect(h.text).toMatch(/No hint/);
  });
});

describe('sample difficulty', async () => {
  const { SAMPLES } = await import('../src/samples');
  const { decodePuzzle } = await import('../src/codec');
  const { rateDifficulty } = await import('../src/generator');
  // The sparse big-board collections are left out: they are slow to rate.
  // Their uniqueness is still checked in solver.test.ts.
  for (const s of SAMPLES.filter((x) => x.group !== 'fewest' && x.group !== 'hardsparse')) {
    const expected = s.level;
    test(`${s.level} ${s.name} is unique and rated ${expected}`, () => {
      const p = decodePuzzle(s.code);
      expect(solve(p).status).toBe('unique');
      expect(rateDifficulty(p)).toBe(expected);
    });
  }
});

describe('hint choice', async () => {
  const { findHint, deductions } = await import('../src/logic');
  const { SAMPLES } = await import('../src/samples');
  const { decodePuzzle } = await import('../src/codec');
  const { EASY_RULES } = await import('../src/generator');
  test('among checkerboard deductions, the hint picks the fewest exits, then the smallest area', () => {
    let tried = 0;
    for (const s of SAMPLES.filter((x) => !x.group && x.level === 'medium')) {
      const p = decodePuzzle(s.code);
      // Where the easy rules get stuck, the hint must use Checkerboard balance.
      const state = runToEnd(p, EASY_RULES).state;
      const h = findHint(p, state);
      if (h.kind !== 'deduction' || h.deduction.rule !== 'balance') continue;
      tried++;
      const all = deductions(p, state, ['balance']);
      const fewest = Math.min(...all.map((d) => d.exits!));
      expect(h.deduction.exits, s.name).toBe(fewest);
      const smallest = Math.min(...all.filter((d) => d.exits === fewest).map((d) => d.cells!.length));
      expect(h.deduction.cells?.length, s.name).toBe(smallest);
    }
    // Four medium samples need Checkerboard balance (the Numbers samples that also did are gone).
    expect(tried).toBeGreaterThanOrEqual(4);
  });
});

describe('more rules', () => {
  test('no sealed areas: a line that would wall tiles off gets an X', () => {
    // 4x4, ends low on the right: the top-left pair 0,1 can only be reached through 0-4 and 1-5. Tiles 4 and 5
    // each already have one line, so joining them would fill both and seal 0,1 off.
    const p = board(4, 4);
    p.walls.add(edgeBetween(p, 1, 2));
    const state: LogicState = { segments: new Set([edgeBetween(p, 4, 8), edgeBetween(p, 5, 6)]), xs: new Set() };
    expect(logicStep(p, state, ['noSeal']).xs).toContain(edgeBetween(p, 4, 5));
  });
});

describe('runLogic', async () => {
  const { runLogic } = await import('../src/logic');
  test('runs the rules to the end, the same as stepping', () => {
    const p = board(4, 4);
    const run = runLogic(p, ALL_RULES);
    const stepped = runToEnd(p, ALL_RULES);
    expect(run.solved).toBe(stepped.solved);
    expect([...run.state.segments].sort()).toEqual([...stepped.state.segments].sort());
    expect(run.rounds).toBeGreaterThan(0);
  });
  test('stops when the rules find nothing', () => {
    const run = runLogic(createPuzzle(4, 4), []);
    expect(run).toMatchObject({ rounds: 0, solved: false });
  });
});

describe('orientation', async () => {
  const { decodePuzzle } = await import('../src/codec');
  const { rateDifficulty } = await import('../src/generator');
  const { transformPuzzle } = await import('../src/model');
  test('rooms for Checkerboard balance do not depend on which way the board faces', () => {
    // This 7×7 once rated very hard one way and hard mirrored: a tie in growing a
    // room was always broken towards the top left.
    const p = decodePuzzle('BjGm4YgNS8d_SYA');
    expect(rateDifficulty(p)).toBe(rateDifficulty(transformPuzzle(p, 'flipH')));
  }, 30000);
});

describe('deduction areas', async () => {
  const { deductions } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { edgeCells: cellsOf } = await import('../src/model');
  test('a balance deduction keeps the area it used, not the room it grew into', () => {
    const p = decodePuzzle('BjGhLYr-SEN9QHQ');
    for (const d of deductions(p, empty(), ['balance'])) {
      const area = new Set(d.cells);
      // Every mark it draws crosses the area's edge.
      for (const e of [...d.segments, ...d.xs]) {
        const [a, b] = cellsOf(p, e);
        expect(area.has(a) !== area.has(b)).toBe(true);
      }
    }
  });
});

describe('area sources', async () => {
  const { deductions } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { edgeBetween: between } = await import('../src/model');
  const { SAMPLES } = await import('../src/samples');
  // Path 7×7 · walls: the bottom-row edge between columns 3 and 4 comes from an L-shaped room.
  const p = decodePuzzle('BjGhLYr-SEN9QHQ');
  const target = between(p, 6 * 7 + 2, 6 * 7 + 3);
  const draws = (opts: object) => deductions(p, empty(), ['balance'], opts).some((d) => d.segments.includes(target));
  test('switching off rooms loses an area only rooms find', () => {
    expect(draws({})).toBe(true);
    expect(draws({ areaSources: ['cuts', 'cuts3', 'rects'] })).toBe(false);
    expect(draws({ areaSources: [] })).toBe(false);
  });
  test('switching off cut-off areas leaves Bottlenecks alone', () => {
    for (const s of SAMPLES.slice(0, 15)) {
      const q = decodePuzzle(s.code);
      const all = deductions(q, empty(), ['bottlenecks']).length;
      expect(deductions(q, empty(), ['bottlenecks'], { areaSources: [] }).length, s.name).toBe(all);
    }
  });
});

describe('three-border cuts', async () => {
  const { deductions, AREA_SOURCES } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { SAMPLES } = await import('../src/samples');
  test('are only looked at when nothing else applies', () => {
    const noCuts3 = AREA_SOURCES.filter((x) => x !== 'cuts3');
    for (const s of SAMPLES.slice(0, 20)) {
      const p = decodePuzzle(s.code);
      const all = deductions(p, empty(), ALL_RULES);
      const without = deductions(p, empty(), ALL_RULES, { areaSources: noCuts3 });
      // Whenever anything else applies, the 3-border search adds nothing.
      if (without.length) expect(all.length, s.name).toBe(without.length);
    }
  });
});

describe('three-border cuts by labels', async () => {
  const { deductions } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { EASY_RULES } = await import('../src/generator');
  const { SAMPLES } = await import('../src/samples');
  const marks = (d: { segments: number[]; xs: number[] }) => JSON.stringify([[...d.segments].sort((a, b) => a - b), [...d.xs].sort((a, b) => a - b)]);
  test('find the same marks as the original search', () => {
    for (const s of SAMPLES.filter((x) => !x.group).slice(0, 8)) {
      const p = decodePuzzle(s.code);
      for (const state of [empty(), runToEnd(p, EASY_RULES).state]) {
        // The search also re-finds 2-border areas; those belong to the other source.
        const two = new Set(deductions(p, state, ['balance'], { areaSources: ['cuts'] }).map(marks));
        const get = (threeCuts: 'labels' | 'search') =>
          [...new Set(deductions(p, state, ['balance'], { areaSources: ['cuts3'], threeCuts }).map(marks))].filter((k) => !two.has(k)).sort();
        expect(get('labels'), s.name).toEqual(get('search'));
      }
    }
  });
});

describe('hintJourney', async () => {
  const { hintJourney, ADVANCED_RULES } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { SAMPLES } = await import('../src/samples');
  test('only advanced rules appear, and every sample short of very hard gets solved', () => {
    for (const s of SAMPLES.filter((x) => !x.group && x.level !== 'veryhard')) {
      const j = hintJourney(decodePuzzle(s.code));
      expect(j.outcome, s.name).toBe('solved');
      for (const step of j.steps) expect(ADVANCED_RULES, s.name).toContain(step.rule);
      // Easy means the easy rules plus Bottlenecks are enough.
      if (s.level === 'easy') expect(j.steps.every((x) => x.rule === 'bottlenecks'), s.name).toBe(true);
    }
  });
  test('area rules report the size of their area', () => {
    for (const s of SAMPLES.filter((x) => !x.group && x.level === 'medium')) {
      for (const step of hintJourney(decodePuzzle(s.code)).steps) {
        if (step.rule === 'balance' || step.rule === 'bottlenecks') expect(step.area, s.name).toBeGreaterThan(1);
        else expect(step.area).toBeUndefined();
      }
    }
  });
});

describe('searchMetrics', async () => {
  const { hintJourney, searchMetrics } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { SAMPLES } = await import('../src/samples');
  test('the samples get scores, with hard rounds only where the easy rules need help', () => {
    for (const s of SAMPLES.filter((x) => !x.group && x.level !== 'veryhard')) {
      const p = decodePuzzle(s.code);
      const m = searchMetrics(p);
      expect(m.stuck, s.name).toBe(false);
      expect(m.tightest, s.name).toBeGreaterThan(0);
      expect(m.effort, s.name).toBeGreaterThanOrEqual(m.tightest);
      expect(m.hardRounds > 0, s.name).toBe(hintJourney(p).steps.length > 0);
    }
  });
});
