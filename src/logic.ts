import { cellCount, cellEdges, edgeCells, endpointCells, isHorizontalEdge, isUsableEdge, modeOf, openCells, type Puzzle } from './model';

/**
 * Simple, local deduction rules for the editor's logic helper. A "step"
 * looks at the current deductions, finds everything every enabled rule can
 * conclude from them, and applies all of it at once.
 */

export type RuleId = 'corners' | 'passages' | 'ends' | 'continue' | 'complete' | 'noLoops';

export const RULES: { id: RuleId; label: string; hint: string }[] = [
  { id: 'corners', label: 'Corners', hint: 'A tile with only two ways out, at a right angle, uses both.' },
  { id: 'passages', label: 'Passages', hint: 'A tile walled in on two opposite sides gets a line straight through.' },
  { id: 'ends', label: 'Ends', hint: 'A path end with only one way out takes it.' },
  { id: 'continue', label: 'Continue', hint: 'A partly drawn tile whose remaining ways out are exactly what it still needs takes them.' },
  { id: 'complete', label: 'Full tiles', hint: 'A tile that already has all its lines gets an X on its other borders.' },
  { id: 'noLoops', label: 'No early loops', hint: 'X out a border that would close a loop before every tile is used.' },
];

export const ALL_RULES: RuleId[] = RULES.map((r) => r.id);

export interface LogicState {
  segments: Set<number>;
  xs: Set<number>;
}

export interface StepResult {
  /** Newly deduced segments and X marks. */
  segments: number[];
  xs: number[];
  /** How many marks each rule contributed. */
  byRule: Partial<Record<RuleId, number>>;
  /** A tile where the deductions break the rules (the puzzle has no solution). */
  contradiction?: { cell: number; reason: string };
  /** Every tile has all its lines: the logic has solved the puzzle. */
  solved: boolean;
}

/**
 * How many path segments each open tile must have, or null where that isn't
 * known yet (a path puzzle with fewer than two ends).
 */
function needs(p: Puzzle): Int8Array | null {
  const need = new Int8Array(cellCount(p));
  for (const c of openCells(p)) need[c] = 2;
  if (modeOf(p) === 'path') {
    const ends = endpointCells(p);
    if (ends.length < 2) return null;
    for (const c of ends) need[c] = 1;
  }
  return need;
}

export function logicStep(p: Puzzle, state: LogicState, rules: Iterable<RuleId>): StepResult {
  const enabled = new Set(rules);
  const result: StepResult = { segments: [], xs: [], byRule: {}, solved: false };
  const need = needs(p);
  if (!need) return result;

  const open = openCells(p);
  const addSeg = new Map<number, RuleId>();
  const addX = new Map<number, RuleId>();
  const avail = (c: number) => cellEdges(p, c).filter((e) => isUsableEdge(p, e) && !state.xs.has(e));

  let allDone = true;
  for (const c of open) {
    const a = avail(c);
    const drawn = a.filter((e) => state.segments.has(e));
    const free = a.filter((e) => !state.segments.has(e));
    if (drawn.length > need[c]) {
      result.contradiction = { cell: c, reason: 'A tile has too many lines.' };
      return result;
    }
    if (a.length < need[c]) {
      result.contradiction = { cell: c, reason: 'A tile has too few ways in or out.' };
      return result;
    }
    if (drawn.length < need[c]) allDone = false;

    if (drawn.length === need[c]) {
      if (enabled.has('complete')) for (const e of free) addX.set(e, 'complete');
    } else if (a.length === need[c]) {
      // Every remaining way out is needed.
      let rule: RuleId;
      if (drawn.length > 0) rule = 'continue';
      else if (need[c] === 1) rule = 'ends';
      else rule = isHorizontalEdge(p, free[0]) === isHorizontalEdge(p, free[1]) ? 'passages' : 'corners';
      if (enabled.has(rule)) for (const e of free) addSeg.set(e, rule);
    }
  }
  if (allDone) {
    result.solved = true;
    return result;
  }

  if (enabled.has('noLoops')) {
    for (const e of earlyLoopEdges(p, state, need, open.length)) if (!addSeg.has(e)) addX.set(e, 'noLoops');
  }

  for (const [e, rule] of addSeg) {
    if (addX.has(e) || state.xs.has(e)) {
      result.contradiction = { cell: edgeCells(p, e)[0], reason: 'The rules disagree about a border.' };
      return result;
    }
    if (state.segments.has(e)) continue;
    result.segments.push(e);
    result.byRule[rule] = (result.byRule[rule] ?? 0) + 1;
  }
  for (const [e, rule] of addX) {
    if (state.xs.has(e) || state.segments.has(e)) continue;
    result.xs.push(e);
    result.byRule[rule] = (result.byRule[rule] ?? 0) + 1;
  }
  return result;
}

/**
 * Empty, usable borders joining the two loose ends of one drawn piece. Drawing
 * one would close a loop, which is only allowed for a loop puzzle when that
 * loop takes in every tile.
 */
function earlyLoopEdges(p: Puzzle, state: LogicState, need: Int8Array, openCount: number): number[] {
  const n = cellCount(p);
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const size = new Int32Array(n).fill(1);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const degree = new Int32Array(n);
  for (const e of state.segments) {
    const [a, b] = edgeCells(p, e);
    degree[a]++;
    degree[b]++;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      size[rb] += size[ra];
    }
  }
  const out: number[] = [];
  const loopPuzzle = modeOf(p) === 'cycle';
  for (const c of openCells(p)) {
    for (const e of cellEdges(p, c)) {
      const [a, b] = edgeCells(p, e);
      if (a !== c) continue; // each border once
      if (!isUsableEdge(p, e) || state.segments.has(e) || state.xs.has(e)) continue;
      if (degree[a] !== 1 || degree[b] !== 1 || need[a] !== 2 || need[b] !== 2) continue;
      const r = find(a);
      if (r !== find(b)) continue;
      if (loopPuzzle && size[r] === openCount) continue; // closing the full loop is the answer
      out.push(e);
    }
  }
  return out;
}

/** Apply step results to a state (returns a new state). */
export function applyStep(state: LogicState, step: StepResult): LogicState {
  return {
    segments: new Set([...state.segments, ...step.segments]),
    xs: new Set([...state.xs, ...step.xs]),
  };
}
