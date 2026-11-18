import { describe, expect, test } from 'vitest';
import { ALL_RULES, applyStep, BASIC_RULES, logicStep, type LogicState, type RuleId } from '../src/logic';
import { createPuzzle, edgeBetween, edgeCount, isUsableEdge, portEnd, portId, type Puzzle } from '../src/model';
import { solve } from '../src/solver';
import { pathEdges } from './helpers';

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
  test('corners fill a 2x2 loop in one step', () => {
    const p = createPuzzle(2, 2);
    const step = logicStep(p, empty(), ['corners']);
    expect(step.segments).toHaveLength(4);
    expect(step.byRule.corners).toBe(4);
    expect(logicStep(p, applyStep(empty(), step), ['corners']).solved).toBe(true);
  });

  test('passages: a tile walled on opposite sides gets a straight line', () => {
    const p = createPuzzle(3, 3);
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
    const state: LogicState = { segments: new Set([edgeBetween(p, 3, 4), edgeBetween(p, 4, 5)]), xs: new Set() };
    const step = logicStep(p, state, ['passages']);
    expect(step.xs).toEqual([]);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 1), edgeBetween(p, 1, 2)]));
  });

  test('no early loops: the border that would close a small loop gets an X', () => {
    // (On a 3x3 the full tiles would wall the top-right corner off, a contradiction.)
    const p = createPuzzle(4, 4);
    const state: LogicState = { segments: pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]]), xs: new Set() };
    const step = logicStep(p, state, ['noLoops']);
    expect(step.xs).toEqual([edgeBetween(p, 0, 4)]);
  });

  test('no early finish: joining both path ends too soon gets an X', () => {
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 2];
    const state: LogicState = { segments: new Set([edgeBetween(p, 0, 1)]), xs: new Set() };
    expect(logicStep(p, state, ['noFinish']).xs).toEqual([edgeBetween(p, 1, 2)]);
  });

  test('number order: joining 1 straight to 3 gets an X', async () => {
    const { findHint } = await import('../src/logic');
    const p = createPuzzle(3, 3);
    p.checkpoints = [0, 8, 1, 6]; // 1 top-left, 2 bottom-right, 3 top-middle, 4 bottom-left
    const step = logicStep(p, empty(), ['order']);
    expect(step.xs).toContain(edgeBetween(p, 0, 1));
    expect(step.byRule).toEqual({ order: step.xs.length });
    const state = runToEnd(p, ['corners', 'passages', 'continue', 'noLoops']).state;
    const h = findHint(p, state);
    if (h.kind === 'deduction' && h.deduction.rule === 'order') expect(h.text).toMatch(/without passing 2/);
  });

  test('bottlenecks: an area with two ways in uses both', () => {
    const p = createPuzzle(4, 4);
    // The top-left 2x2 is reachable only through 1-2 and 4-8.
    p.walls.add(edgeBetween(p, 5, 6)).add(edgeBetween(p, 5, 9));
    const step = logicStep(p, empty(), ['bottlenecks']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 1, 2), edgeBetween(p, 4, 8)]));
  });

  test('checkerboard balance: an area with an extra white tile is entered on white tiles', () => {
    // 3x4 loop: the top row is white, shaded, white, so the loop must enter it on
    // white tiles twice more than on shaded ones: down from both corners, never the middle.
    const p = createPuzzle(3, 4);
    const step = logicStep(p, empty(), ['balance']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 3), edgeBetween(p, 2, 5)]));
    expect(step.xs).toContain(edgeBetween(p, 1, 4));
  });

  test('checkerboard balance: a balanced area is left on shaded and white tiles equally', () => {
    // 4x4 loop: the left column (white, shaded, white, shaded) can only be left from
    // its top (white) and bottom (shaded) tiles, so both must be used.
    const p = createPuzzle(4, 4);
    p.walls.add(edgeBetween(p, 4, 5)).add(edgeBetween(p, 8, 9));
    const step = logicStep(p, empty(), ['balance']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 1), edgeBetween(p, 12, 13)]));
  });

  test('a cut-off area is a contradiction', () => {
    const p = createPuzzle(4, 2);
    p.walls.add(edgeBetween(p, 1, 2)).add(edgeBetween(p, 5, 6));
    expect(logicStep(p, empty(), ['bottlenecks']).contradiction?.cells?.length).toBe(4);
  });

  test('reports a contradiction', () => {
    const p = createPuzzle(3, 3);
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
      if (rand() < 0.5) {
        const a = Math.floor(rand() * 2 * (w + h));
        const b = Math.floor(rand() * 2 * (w + h));
        if (a !== b) p.endpoints = [portEnd(a), portEnd(b)];
      }
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
    for (let trial = 0; trial < 5000 && checked < 300; trial++) {
      const w = 3 + Math.floor(rand() * 4);
      const h = 3 + Math.floor(rand() * 4);
      const p = createPuzzle(w, h);
      for (let c = 0; c < w * h; c++) if (rand() < 0.05) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) if (rand() < 0.1 && isUsableEdge(p, e)) p.walls.add(e);
      const k = rand();
      if (k < 0.33) {
        const a = Math.floor(rand() * 2 * (w + h));
        const b = Math.floor(rand() * 2 * (w + h));
        if (a !== b) p.endpoints = [portEnd(a), portEnd(b)];
      } else if (k < 0.66) {
        const m = 2 + Math.floor(rand() * 4);
        for (let i = 0; i < m; i++) {
          const c = Math.floor(rand() * w * h);
          if (!p.blocked.has(c) && !p.checkpoints.includes(c)) p.checkpoints.push(c);
        }
      }
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
    const p = createPuzzle(6, 6);
    const piece = (cells: number[]) => cells.slice(1).map((c, i) => edgeBetween(p, cells[i], c));
    // A 6-tile U at the top left and a 4-tile U at the bottom right, each one border from closing.
    const state: LogicState = { segments: new Set([...piece([0, 1, 2, 8, 7, 6]), ...piece([28, 29, 35, 34])]), xs: new Set() };
    const loops = deductions(p, state, ['noLoops']);
    expect(loops.map((d) => [d.xs[0], d.size])).toEqual([
      [edgeBetween(p, 0, 6), 6],
      [edgeBetween(p, 28, 34), 4],
    ]);
  });

  test('only uses the rules it is given', () => {
    const p = createPuzzle(2, 2);
    expect(findHint(p, empty(), ['passages']).kind).toBe('none');
    const h = findHint(p, empty(), ['corners']);
    expect(h.kind === 'deduction' && h.deduction.rule).toBe('corners');
  });

  test('the simplest rule comes first, with an explanation', () => {
    const p = createPuzzle(2, 2);
    const h = findHint(p, empty());
    expect(h.kind).toBe('deduction');
    if (h.kind !== 'deduction') return;
    expect(h.deduction.rule).toBe('corners');
    expect(h.deduction.cell).toBe(0);
    expect(h.deduction.segments).toHaveLength(2);
    expect(h.text).toMatch(/corner/);
  });

  test('points out a mistake on the board', () => {
    const p = createPuzzle(3, 3);
    const state: LogicState = { segments: new Set([edgeBetween(p, 4, 1), edgeBetween(p, 4, 3), edgeBetween(p, 4, 5)]), xs: new Set() };
    const h = findHint(p, state);
    expect(h.kind).toBe('mistake');
  });

  test('says so when no simple rule applies', () => {
    const p = createPuzzle(4, 4); // a loop with many solutions: the rules get stuck
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
    expect(tried).toBeGreaterThan(5);
  });
});

describe('more rules', async () => {
  const { rulesFor } = await import('../src/logic');

  test('no sealed areas: a line that would wall tiles off gets an X', () => {
    // 4x4 loop: the top-left pair 0,1 can only be reached through 0-4 and 1-5. Tiles 4 and 5
    // each already have one line, so joining them would fill both and seal 0,1 off.
    const p = createPuzzle(4, 4);
    p.walls.add(edgeBetween(p, 1, 2));
    const state: LogicState = { segments: new Set([edgeBetween(p, 4, 8), edgeBetween(p, 5, 6)]), xs: new Set() };
    expect(logicStep(p, state, ['noSeal']).xs).toContain(edgeBetween(p, 4, 5));
  });

  test('number crossings: an area the numbers go in and out of uses every way across', () => {
    // 4x3: numbers alternate between the left column and the rest, so the path crosses
    // the left column's edge at least 3 times — and it has exactly 3 ways across.
    const p = createPuzzle(4, 3);
    p.checkpoints = [0, 3, 8, 11];
    const step = logicStep(p, empty(), ['spacing']);
    expect(step.segments).toEqual(expect.arrayContaining([edgeBetween(p, 0, 1), edgeBetween(p, 4, 5), edgeBetween(p, 8, 9)]));
  });

  test('number crossings only shows for puzzles with three or more numbers', () => {
    const p = createPuzzle(4, 3);
    expect(rulesFor(p).some((r) => r.id === 'spacing')).toBe(false);
    p.checkpoints = [0, 3, 8];
    expect(rulesFor(p).some((r) => r.id === 'spacing')).toBe(true);
  });
});

describe('runLogic', async () => {
  const { runLogic } = await import('../src/logic');
  test('runs the rules to the end, the same as stepping', () => {
    const p = createPuzzle(4, 4);
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
    const p = decodePuzzle('BQQHBwANABgBAEACAAAACAAACAAAAAABEA');
    expect(rateDifficulty(p)).toBe(rateDifficulty(transformPuzzle(p, 'flipH')));
  }, 30000);
});

describe('deduction areas', async () => {
  const { deductions } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { edgeCells: cellsOf } = await import('../src/model');
  test('a balance deduction keeps the area it used, not the room it grew into', () => {
    const p = decodePuzzle('BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA');
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
  const p = decodePuzzle('BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA');
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

describe('satisfied areas', async () => {
  const { findHint } = await import('../src/logic');
  const { decodePuzzle } = await import('../src/codec');
  const { edgeBetween: between } = await import('../src/model');
  test('a player who drew most of a chain by hand still gets a balance hint for the rest', () => {
    const p = decodePuzzle('BQEKCgAAAAAAAAAAAAAAAABAAAABAAQAEAAAAAAAAAAAAAAAQAUA');
    const edge = between(p, 9 * 10 + 7, 9 * 10 + 8); // H10-I10
    let s = empty();
    // The player's own lines: the first 18 moves, down columns A-B and along rows 9-10 to G9-H9.
    for (let i = 0; i < 18; i++) {
      const h = findHint(p, s, ALL_RULES);
      if (h.kind !== 'deduction') throw new Error('stuck early');
      s = applyStep(s, { segments: h.deduction.segments, xs: h.deduction.xs, byRule: {}, solved: false });
    }
    const h = findHint(p, s, ALL_RULES);
    expect(h.kind === 'deduction' && h.deduction.rule).toBe('balance');
    expect(h.kind === 'deduction' && h.deduction.segments.includes(edge)).toBe(true);
  }, 60000);
});
