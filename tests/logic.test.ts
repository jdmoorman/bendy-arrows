import { describe, expect, test } from 'vitest';
import { ALL_RULES, applyStep, logicStep, type LogicState, type RuleId } from '../src/logic';
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

  test('full tiles get X marks', () => {
    const p = createPuzzle(3, 3);
    const state: LogicState = { segments: new Set([edgeBetween(p, 3, 4), edgeBetween(p, 4, 5)]), xs: new Set() };
    const step = logicStep(p, state, ['complete']);
    expect(new Set(step.xs)).toEqual(new Set([edgeBetween(p, 1, 4), edgeBetween(p, 4, 7)]));
  });

  test('no early loops: the border that would close a small loop gets an X', () => {
    const p = createPuzzle(3, 3);
    const state: LogicState = { segments: pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]]), xs: new Set() };
    const step = logicStep(p, state, ['noLoops']);
    expect(step.xs).toEqual([edgeBetween(p, 0, 3)]);
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

describe('findHint', async () => {
  const { findHint } = await import('../src/logic');

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

describe('tricky samples', async () => {
  const { SAMPLES } = await import('../src/samples');
  const { decodePuzzle } = await import('../src/codec');
  for (const s of SAMPLES.filter((x) => x.name.startsWith('Tricky'))) {
    test(`${s.name} is unique but not solved by the simple rules alone`, () => {
      const p = decodePuzzle(s.code);
      expect(solve(p).status).toBe('unique');
      const end = runToEnd(p);
      expect(end.contradiction).toBeUndefined();
      expect(end.solved).toBe(false);
    });
  }
});
