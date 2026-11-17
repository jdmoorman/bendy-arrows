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

/** One conclusion of one rule at one tile. */
export interface Deduction {
  rule: RuleId;
  cell: number;
  segments: number[];
  xs: number[];
}

type Analysis =
  | { kind: 'unknown' }
  | { kind: 'contradiction'; cell: number; reason: string }
  | { kind: 'solved' }
  | { kind: 'open'; deductions: Deduction[] };

/** Everything the rules can conclude from a state (each deduction is new). */
function analyse(p: Puzzle, state: LogicState, enabled: Set<RuleId>): Analysis {
  const need = needs(p);
  if (!need) return { kind: 'unknown' };
  const open = openCells(p);
  const deductions: Deduction[] = [];
  let allDone = true;
  for (const c of open) {
    const a = cellEdges(p, c).filter((e) => isUsableEdge(p, e) && !state.xs.has(e));
    const drawn = a.filter((e) => state.segments.has(e));
    const free = a.filter((e) => !state.segments.has(e));
    if (drawn.length > need[c]) return { kind: 'contradiction', cell: c, reason: 'A tile has too many lines.' };
    if (a.length < need[c]) return { kind: 'contradiction', cell: c, reason: 'A tile has too few ways in or out.' };
    if (drawn.length < need[c]) allDone = false;

    if (drawn.length === need[c]) {
      if (free.length && enabled.has('complete')) deductions.push({ rule: 'complete', cell: c, segments: [], xs: free });
    } else if (a.length === need[c]) {
      // Every remaining way out is needed.
      let rule: RuleId;
      if (drawn.length > 0) rule = 'continue';
      else if (need[c] === 1) rule = 'ends';
      else rule = isHorizontalEdge(p, free[0]) === isHorizontalEdge(p, free[1]) ? 'passages' : 'corners';
      if (enabled.has(rule)) deductions.push({ rule, cell: c, segments: free, xs: [] });
    }
  }
  if (allDone) return { kind: 'solved' };
  if (enabled.has('noLoops')) {
    for (const e of earlyLoopEdges(p, state, need, open.length)) {
      deductions.push({ rule: 'noLoops', cell: edgeCells(p, e)[0], segments: [], xs: [e] });
    }
  }
  return { kind: 'open', deductions };
}

export function logicStep(p: Puzzle, state: LogicState, rules: Iterable<RuleId>): StepResult {
  const result: StepResult = { segments: [], xs: [], byRule: {}, solved: false };
  const an = analyse(p, state, new Set(rules));
  if (an.kind === 'unknown') return result;
  if (an.kind === 'contradiction') {
    result.contradiction = { cell: an.cell, reason: an.reason };
    return result;
  }
  if (an.kind === 'solved') {
    result.solved = true;
    return result;
  }
  const addSeg = new Map<number, RuleId>();
  const addX = new Map<number, RuleId>();
  for (const d of an.deductions) {
    for (const e of d.segments) addSeg.set(e, d.rule);
    for (const e of d.xs) addX.set(e, d.rule);
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

/** Simplest rules first: the order hints are chosen in. */
export const HINT_ORDER: RuleId[] = ['corners', 'passages', 'ends', 'complete', 'continue', 'noLoops'];

export type Hint =
  | { kind: 'deduction'; deduction: Deduction; text: string }
  | { kind: 'mistake'; cell: number; text: string }
  | { kind: 'solved'; text: string }
  | { kind: 'none'; text: string };

/**
 * The single simplest thing the rules can tell the player about their board,
 * with an explanation.
 */
export function findHint(p: Puzzle, state: LogicState): Hint {
  const an = analyse(p, state, new Set(HINT_ORDER));
  if (an.kind === 'unknown') return { kind: 'none', text: 'Hints need the puzzle to have both ends.' };
  if (an.kind === 'contradiction') {
    const text =
      an.reason === 'A tile has too many lines.'
        ? 'Something is off: the highlighted tile has more lines than the path can use there.'
        : 'Something is off: the highlighted tile has too few ways in or out left — check the X marks around it.';
    return { kind: 'mistake', cell: an.cell, text };
  }
  if (an.kind === 'solved') return { kind: 'solved', text: 'Every tile already has its lines.' };
  for (const rule of HINT_ORDER) {
    const d = an.deductions.filter((x) => x.rule === rule).sort((a, b) => a.cell - b.cell)[0];
    if (d) return { kind: 'deduction', deduction: d, text: explain(p, state, d) };
  }
  return { kind: 'none', text: 'No hint available — none of the simple rules apply here. Time for some deeper thinking!' };
}

const DIR_NAMES = (p: Puzzle, cell: number, e: number): string => {
  const [a, b] = edgeCells(p, e);
  const other = a === cell ? b : a;
  if (other === cell - p.w) return 'up';
  if (other === cell + p.w) return 'down';
  return other === cell - 1 ? 'left' : 'right';
};

function explain(p: Puzzle, state: LogicState, d: Deduction): string {
  const dirs = (es: number[]) => es.map((e) => DIR_NAMES(p, d.cell, e)).join(' and ');
  const isEnd = endpointCells(p).includes(d.cell);
  const drawn = cellEdges(p, d.cell).filter((e) => state.segments.has(e)).length;
  switch (d.rule) {
    case 'corners':
      return `The highlighted tile has only two ways out, ${dirs(d.segments)}, and the path must pass through it — so it turns the corner using both.`;
    case 'passages':
      return `The highlighted tile is blocked on two opposite sides, so the path must go straight through it, ${dirs(d.segments)}.`;
    case 'ends':
      return `The path ends at the highlighted tile, and the only way out of it is ${dirs(d.segments)} — so the path must go that way.`;
    case 'complete':
      return `The highlighted tile already has ${isEnd ? 'the one line it needs (it is a path end)' : 'both lines it needs'}, so it can't use any other border — mark ${dirs(d.xs)} with an X.`;
    case 'continue':
      return `The highlighted tile has ${drawn} line${drawn === 1 ? '' : 's'} and needs ${isEnd ? 1 : 2}; its only remaining way out is ${dirs(d.segments)}, so the path must continue there.`;
    case 'noLoops':
      return `Joining the highlighted border would close a loop before every tile is used, so it gets an X.`;
  }
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
