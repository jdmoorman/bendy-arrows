import { cellCount, cellEdges, edgeCells, edgeCount, endpointCells, isHorizontalEdge, isUsableEdge, modeOf, openCells, type Puzzle } from './model';

/**
 * Simple, local deduction rules for the editor's logic helper. A "step"
 * looks at the current deductions, finds everything every enabled rule can
 * conclude from them, and applies all of it at once.
 */

export type RuleId = 'corners' | 'passages' | 'continue' | 'noLoops' | 'noFinish' | 'order' | 'bottlenecks' | 'balance';

export interface RuleInfo {
  id: RuleId;
  label: string;
  hint: string;
  /** Whether the rule can ever apply to this puzzle (default: always). */
  appliesTo?: (p: Puzzle) => boolean;
}

export const RULES: RuleInfo[] = [
  { id: 'corners', label: 'Corners', hint: 'A tile with only two ways out, at a right angle, uses both.' },
  { id: 'passages', label: 'Passages', hint: 'A tile walled in on two opposite sides gets a line straight through.' },
  {
    id: 'continue',
    label: 'Continue',
    hint: 'A tile whose remaining ways out are exactly what it still needs takes them — including a path end with only one way out.',
  },
  { id: 'noLoops', label: 'No early loops', hint: 'X out a border that would close a loop before every tile is used.' },
  {
    id: 'noFinish',
    label: 'No early finish',
    hint: 'X out a border that would join both ends of the path before every tile is used.',
    appliesTo: (p) => modeOf(p) === 'path',
  },
  {
    id: 'order',
    label: 'Number order',
    hint: 'X out a border that would join numbers out of order, or skip one.',
    appliesTo: (p) => p.checkpoints.length >= 3,
  },
  {
    id: 'bottlenecks',
    label: 'Bottlenecks',
    hint: 'An area reachable through only two borders uses both (or just one, when one end of the path is inside).',
  },
  {
    id: 'balance',
    label: 'Checkerboard balance',
    hint: 'The path alternates shaded and white tiles, so an area with more of one colour must be entered on that colour.',
  },
];

/** The rules from before the advanced ones were added (for migrating saved choices). */
export const BASIC_RULES: RuleId[] = ['corners', 'passages', 'continue', 'noLoops'];

export const ALL_RULES: RuleId[] = RULES.map((r) => r.id);

/** The rules that can apply to this puzzle. */
export function rulesFor(p: Puzzle): RuleInfo[] {
  return RULES.filter((r) => !r.appliesTo || r.appliesTo(p));
}

export interface LogicState {
  segments: Set<number>;
  xs: Set<number>;
}

export interface Contradiction {
  cell: number;
  /** Tiles to highlight (defaults to `cell`). */
  cells?: number[];
  /** Short reason for the editor. */
  reason: string;
  /** Longer explanation for a Play hint. */
  hint: string;
}

export interface StepResult {
  /** Newly deduced segments and X marks. */
  segments: number[];
  xs: number[];
  /** How many marks each rule contributed. */
  byRule: Partial<Record<RuleId, number>>;
  /** A tile where the deductions break the rules (the puzzle has no solution). */
  contradiction?: Contradiction;
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
  /** An area the deduction is about, to highlight. */
  cells?: number[];
  /** Explanation, for rules that work it out when deducing. */
  why?: string;
}

type Analysis =
  | { kind: 'unknown' }
  | ({ kind: 'contradiction' } & Contradiction)
  | { kind: 'solved' }
  | { kind: 'open'; deductions: Deduction[] };

/**
 * Borders that are closed because a tile next to them already has all its
 * lines. This is taken as understood: no rule step or hint is spent on it.
 */
function fullTileBorders(p: Puzzle, state: LogicState, need: Int8Array): Set<number> {
  const closed = new Set<number>();
  for (const c of openCells(p)) {
    const edges = cellEdges(p, c);
    if (edges.filter((e) => state.segments.has(e)).length !== need[c]) continue;
    for (const e of edges) if (!state.segments.has(e)) closed.add(e);
  }
  return closed;
}

/** Everything the rules can conclude from a state (each deduction is new). */
function analyse(p: Puzzle, state: LogicState, enabled: Set<RuleId>): Analysis {
  const need = needs(p);
  if (!need) return { kind: 'unknown' };
  const open = openCells(p);
  const closed = fullTileBorders(p, state, need);
  const deductions: Deduction[] = [];
  let allDone = true;
  for (const c of open) {
    const a = cellEdges(p, c).filter((e) => isUsableEdge(p, e) && !state.xs.has(e) && (state.segments.has(e) || !closed.has(e)));
    const drawn = a.filter((e) => state.segments.has(e));
    const free = a.filter((e) => !state.segments.has(e));
    if (drawn.length > need[c]) return { kind: 'contradiction', cell: c, reason: 'A tile has too many lines.', hint: TOO_MANY };
    if (a.length < need[c]) return { kind: 'contradiction', cell: c, reason: 'A tile has too few ways in or out.', hint: TOO_FEW };
    if (drawn.length < need[c]) allDone = false;

    if (drawn.length < need[c] && a.length === need[c]) {
      // Every remaining way out is needed.
      let rule: RuleId;
      // Two fresh ways out at an ordinary tile are a corner or a passage; anything
      // else (a partly drawn tile, or a path end) is continuing the path.
      if (drawn.length > 0 || need[c] === 1) rule = 'continue';
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
  if (enabled.has('noFinish') || enabled.has('order')) {
    deductions.push(...joinRules(p, state, need, closed, open.length, enabled));
  }
  if (enabled.has('bottlenecks') || enabled.has('balance')) {
    const found = areaRules(p, state, need, closed, enabled);
    if ('reason' in found) return { kind: 'contradiction', ...found };
    deductions.push(...found);
  }
  return { kind: 'open', deductions };
}

export function logicStep(p: Puzzle, state: LogicState, rules: Iterable<RuleId>): StepResult {
  const result: StepResult = { segments: [], xs: [], byRule: {}, solved: false };
  const an = analyse(p, state, new Set(rules));
  if (an.kind === 'unknown') return result;
  if (an.kind === 'contradiction') {
    const { kind: _, ...c } = an;
    result.contradiction = c;
    return result;
  }
  if (an.kind === 'solved') {
    result.solved = true;
    return result;
  }
  const addSeg = new Map<number, RuleId>();
  const addX = new Map<number, RuleId>();
  for (const d of an.deductions) {
    // The first (simplest) rule to find a mark gets the credit.
    for (const e of d.segments) if (!addSeg.has(e)) addSeg.set(e, d.rule);
    for (const e of d.xs) if (!addX.has(e)) addX.set(e, d.rule);
  }
  for (const [e, rule] of addSeg) {
    if (addX.has(e) || state.xs.has(e)) {
      result.contradiction = {
        cell: edgeCells(p, e)[0],
        reason: 'The rules disagree about a border.',
        hint: 'Something is off: the highlighted tile has a border that must be both a line and an X — check your lines and X marks nearby.',
      };
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
export const HINT_ORDER: RuleId[] = ['corners', 'passages', 'continue', 'noLoops', 'noFinish', 'order', 'bottlenecks', 'balance'];

const TOO_MANY = 'Something is off: the highlighted tile has more lines than the path can use there.';
const TOO_FEW = 'Something is off: the highlighted tile has too few ways in or out left — check the X marks around it.';

export type Hint =
  | { kind: 'deduction'; deduction: Deduction; text: string }
  | { kind: 'mistake'; cell: number; cells?: number[]; text: string }
  | { kind: 'solved'; text: string }
  | { kind: 'none'; text: string };

/**
 * The single simplest thing the rules can tell the player about their board,
 * with an explanation.
 */
export function findHint(p: Puzzle, state: LogicState): Hint {
  const an = analyse(p, state, new Set(HINT_ORDER));
  if (an.kind === 'unknown') return { kind: 'none', text: 'Hints need the puzzle to have both ends.' };
  if (an.kind === 'contradiction') return { kind: 'mistake', cell: an.cell, cells: an.cells, text: an.hint };
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
  if (d.why) return d.why;
  switch (d.rule) {
    case 'corners':
      return `The highlighted tile has only two ways out, ${dirs(d.segments)}, and the path must pass through it — so it turns the corner using both.`;
    case 'passages':
      return `The highlighted tile is blocked on two opposite sides, so the path must go straight through it, ${dirs(d.segments)}.`;
    case 'continue':
      if (isEnd && drawn === 0) {
        return `The path ends at the highlighted tile, and the only way out of it is ${dirs(d.segments)} — so the path must go that way.`;
      }
      return `The highlighted tile has ${drawn} line${drawn === 1 ? '' : 's'} and needs ${isEnd ? 1 : 2}; its only remaining way out is ${dirs(d.segments)}, so the path must continue there.`;
    case 'noLoops':
      return `Joining the highlighted border would close a loop before every tile is used, so it gets an X.`;
    default:
      return 'The rules say so.';
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

/** Drawn pieces of the path, each walked from one loose end to the other. */
interface Pieces {
  /** Index of the piece each tile belongs to (-1 for blocked tiles). */
  of: Int32Array;
  /** Tiles of each piece in path order, or null where the piece branches or loops. */
  order: (number[] | null)[];
}

function drawnPieces(p: Puzzle, state: LogicState): Pieces {
  const n = cellCount(p);
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (const e of state.segments) {
    const [a, b] = edgeCells(p, e);
    nb[a].push(b);
    nb[b].push(a);
  }
  const of = new Int32Array(n).fill(-1);
  const order: (number[] | null)[] = [];
  for (const start of openCells(p)) {
    if (of[start] >= 0) continue;
    const id = order.length;
    const tiles = [start];
    of[start] = id;
    for (let i = 0; i < tiles.length; i++) {
      for (const m of nb[tiles[i]]) {
        if (of[m] < 0) {
          of[m] = id;
          tiles.push(m);
        }
      }
    }
    const end = tiles.find((c) => nb[c].length <= 1);
    if (end === undefined || tiles.some((c) => nb[c].length > 2)) {
      order.push(null);
      continue;
    }
    const walk = [end];
    let prev = -1;
    let cur = end;
    while (true) {
      const next = nb[cur].find((m) => m !== prev);
      if (next === undefined) break;
      prev = cur;
      cur = next;
      walk.push(cur);
    }
    order.push(walk.length === tiles.length ? walk : null);
  }
  return { of, order };
}

/** Borders that would join two drawn pieces into one that can't be part of the answer. */
function joinRules(p: Puzzle, state: LogicState, need: Int8Array, closed: Set<number>, openCount: number, enabled: Set<RuleId>): Deduction[] {
  const out: Deduction[] = [];
  const isPath = modeOf(p) === 'path';
  const cpIndex = new Map(p.checkpoints.map((c, i) => [c, i]));
  const useOrder = enabled.has('order') && p.checkpoints.length >= 3;
  const useFinish = enabled.has('noFinish') && isPath && new Set(endpointCells(p)).size === 2;
  if (!useOrder && !useFinish) return out;
  const { of, order } = drawnPieces(p, state);
  const numbers = (tiles: number[]) => tiles.filter((c) => cpIndex.has(c)).map((c) => cpIndex.get(c)!);
  const inOrder = (seq: number[]) => seq.every((x, i) => i === 0 || Math.abs(x - seq[i - 1]) === 1);
  for (let e = 0; e < edgeCount(p); e++) {
    if (!isUsableEdge(p, e) || state.xs.has(e) || state.segments.has(e) || closed.has(e)) continue;
    const [a, b] = edgeCells(p, e);
    const A = order[of[a]];
    const B = order[of[b]];
    if (!A || !B || A === B) continue;
    if (useFinish) {
      const ends = [...A, ...B].filter((c) => need[c] === 1).length;
      if (ends >= 2 && A.length + B.length < openCount) {
        out.push({
          rule: 'noFinish',
          cell: a,
          segments: [],
          xs: [e],
          why: 'Joining the highlighted border would link both ends of the path before every tile is used, so it gets an X.',
        });
        continue;
      }
    }
    if (useOrder) {
      // The numbers along A (ending at a), then along B (starting at b).
      const seqA = numbers(A[A.length - 1] === a ? A : [...A].reverse());
      const seqB = numbers(B[0] === b ? B : [...B].reverse());
      if (!seqA.length || !seqB.length || !inOrder(seqA) || !inOrder(seqB)) continue;
      const x = seqA[seqA.length - 1];
      const y = seqB[0];
      if (inOrder([...seqA, ...seqB])) continue;
      const lo = Math.min(x, y) + 1;
      const hi = Math.max(x, y) + 1;
      const skipped = hi - lo === 2 ? `${lo + 1}` : hi - lo > 2 ? `${lo + 1} to ${hi - 1}` : '';
      out.push({
        rule: 'order',
        cell: a,
        segments: [],
        xs: [e],
        why: skipped
          ? `Joining the highlighted border would link ${lo} straight to ${hi} without passing ${skipped}, so it gets an X.`
          : `Joining the highlighted border would put the numbers out of order, so it gets an X.`,
      });
    }
  }
  return out;
}

/**
 * Bridges of the graph of open tiles and open borders (ignoring `skip`): the
 * borders whose removal splits it.
 */
function bridges(n: number, cells: number[], adj: number[][], other: (e: number, c: number) => number, skip: number): number[] {
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const out: number[] = [];
  let t = 0;
  const stackCell: number[] = [];
  const stackEdge: number[] = [];
  const stackIdx: number[] = [];
  for (const s of cells) {
    if (disc[s] >= 0) continue;
    disc[s] = low[s] = t++;
    stackCell.push(s);
    stackEdge.push(-1);
    stackIdx.push(0);
    while (stackCell.length) {
      const top = stackCell.length - 1;
      const v = stackCell[top];
      const es = adj[v];
      if (stackIdx[top] < es.length) {
        const e = es[stackIdx[top]++];
        if (e === skip || e === stackEdge[top]) continue;
        const w = other(e, v);
        if (disc[w] < 0) {
          disc[w] = low[w] = t++;
          stackCell.push(w);
          stackEdge.push(e);
          stackIdx.push(0);
        } else if (disc[w] < low[v]) low[v] = disc[w];
      } else {
        const pe = stackEdge[top];
        stackCell.pop();
        stackEdge.pop();
        stackIdx.pop();
        if (stackCell.length) {
          const u = stackCell[stackCell.length - 1];
          if (low[v] < low[u]) low[u] = low[v];
          if (low[v] > disc[u]) out.push(pe);
        }
      }
    }
  }
  return out;
}

const MAX_CUTS = 4000;

/**
 * Rules about areas of the board: the borders into an area (bottlenecks),
 * and its count of shaded and white tiles (checkerboard balance).
 */
function areaRules(p: Puzzle, state: LogicState, need: Int8Array, closed: Set<number>, enabled: Set<RuleId>): Deduction[] | Contradiction {
  const n = cellCount(p);
  const cells = openCells(p);
  if (cells.length < 2) return [];
  const edges: number[] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < edgeCount(p); e++) {
    if (!isUsableEdge(p, e) || state.xs.has(e)) continue;
    if (!state.segments.has(e) && closed.has(e)) continue;
    edges.push(e);
    const [a, b] = edgeCells(p, e);
    adj[a].push(e);
    adj[b].push(e);
  }
  const other = (e: number, c: number) => {
    const [a, b] = edgeCells(p, e);
    return a === c ? b : a;
  };
  /** Tiles reachable from `start` without crossing `avoid`. */
  const reach = (start: number, avoid: number[], within?: Uint8Array): number[] => {
    const seen = new Uint8Array(n);
    seen[start] = 1;
    const out = [start];
    for (let i = 0; i < out.length; i++) {
      for (const e of adj[out[i]]) {
        if (avoid.includes(e)) continue;
        const m = other(e, out[i]);
        if (seen[m] || (within && !within[m])) continue;
        seen[m] = 1;
        out.push(m);
      }
    }
    return out;
  };

  const all = reach(cells[0], []);
  if (all.length < cells.length) {
    const inAll = new Set(all);
    const rest = cells.filter((c) => !inAll.has(c));
    const cut = all.length < rest.length ? all : rest;
    return {
      cell: Math.min(...cut),
      cells: cut,
      reason: 'Some tiles are cut off from the rest.',
      hint: 'Something is off: the highlighted tiles are cut off from the rest of the board — check the X marks around them.',
    };
  }

  const out: Deduction[] = [];
  const shaded = (c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;

  /** The smaller side of a cut, or null if either side is a single tile (the tile rules cover those). */
  const sideOf = (cut: number[]): number[] | null => {
    const side = reach(edgeCells(p, cut[0])[0], cut);
    const rest = cells.length - side.length;
    if (side.length < 2 || rest < 2) return null;
    if (side.length <= rest) return side;
    const inSide = new Set(side);
    return cells.filter((c) => !inSide.has(c));
  };

  /** Checkerboard balance: the shaded/white mix of `area` fixes how the path crosses `cut`. */
  const balance = (area: number[], cut: number[]): Contradiction | null => {
    const inArea = new Set(area);
    let diff = 0;
    let endS = 0;
    let endW = 0;
    for (const c of area) {
      diff += shaded(c) ? 1 : -1;
      if (need[c] === 1) shaded(c) ? endS++ : endW++;
    }
    const target = 2 * diff - endS + endW; // shaded crossings minus white crossings
    let sDrawn = 0;
    let wDrawn = 0;
    const sOpen: number[] = [];
    const wOpen: number[] = [];
    for (const e of cut) {
      const [a, b] = edgeCells(p, e);
      const s = shaded(inArea.has(a) ? a : b);
      if (state.segments.has(e)) s ? sDrawn++ : wDrawn++;
      else (s ? sOpen : wOpen).push(e);
    }
    const lo = sDrawn - wDrawn - wOpen.length;
    const hi = sDrawn + sOpen.length - wDrawn;
    if (target < lo || target > hi) {
      return {
        cell: Math.min(...area),
        cells: area,
        reason: "An area's shaded and white tiles can't balance.",
        hint: 'Something is off: the highlighted area has the wrong mix of shaded and white tiles for the ways in and out that are left — check the lines and X marks around it.',
      };
    }
    if (!sOpen.length && !wOpen.length) return null;
    let lines: number[];
    let xs: number[];
    let into: string;
    let notInto: string;
    if (target === hi) [lines, xs, into, notInto] = [sOpen, wOpen, 'shaded', 'white'];
    else if (target === lo) [lines, xs, into, notInto] = [wOpen, sOpen, 'white', 'shaded'];
    else return null;
    const more = diff > 0 ? 'shaded' : 'white';
    const less = diff > 0 ? 'white' : 'shaded';
    const n = Math.abs(diff);
    const mix = n === 0 ? 'as many shaded tiles as white ones' : `${n} more ${more} tile${n === 1 ? '' : 's'} than ${less} ones`;
    const ends = endS + endW ? `, counting the path end inside it` : '';
    const doing = [lines.length ? `cross into its ${into} tiles at every open border` : '', xs.length ? `never cross into its ${notInto} tiles` : '']
      .filter(Boolean)
      .join(' and ');
    out.push({
      rule: 'balance',
      cell: Math.min(...area),
      cells: area,
      segments: lines,
      xs,
      why: `On the checkerboard, the highlighted area has ${mix}${ends}. The path alternates colours, so to make that work it must ${doing}.`,
    });
    return null;
  };

  // Cuts of one or two borders.
  const bridges0 = bridges(n, cells, adj, other, -1);
  const isBridge = new Set(bridges0);
  const cuts: number[][] = bridges0.map((g) => [g]);
  const seen = new Set<string>();
  for (const f of edges) {
    if (cuts.length > MAX_CUTS) break;
    if (state.segments.has(f) || isBridge.has(f)) continue;
    for (const g of bridges(n, cells, adj, other, f)) {
      if (isBridge.has(g)) continue;
      const key = f < g ? `${f},${g}` : `${g},${f}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cuts.push([f, g]);
    }
  }
  for (const cut of cuts) {
    const open = cut.filter((e) => !state.segments.has(e));
    if (!open.length) continue;
    const side = sideOf(cut);
    if (!side) continue;
    const odd = side.reduce((s, c) => s + need[c], 0) % 2 === 1;
    if (enabled.has('bottlenecks')) {
      const base = { rule: 'bottlenecks' as const, cell: Math.min(...side), cells: side };
      if (cut.length === 1 && !odd) {
        return {
          cell: base.cell,
          cells: side,
          reason: 'An area can only be reached through one border.',
          hint: 'Something is off: the highlighted area can only be reached through one border, so the path could never get back out — check the X marks around it.',
        };
      }
      if (cut.length === 1) {
        out.push({
          ...base,
          segments: open,
          xs: [],
          why: 'The highlighted area connects to the rest of the board through only one border, and one end of the path is inside it — so the path must cross that border.',
        });
      } else if (!odd) {
        out.push({
          ...base,
          segments: open,
          xs: [],
          why: 'The highlighted area connects to the rest of the board through only two borders. The path has to get in and back out, so it uses both.',
        });
      } else if (open.length === 1) {
        out.push({
          ...base,
          segments: [],
          xs: open,
          why: 'The highlighted area connects to the rest of the board through only two borders, and one end of the path is inside it, so the path crosses just once — through the line already drawn. The other border gets an X.',
        });
      }
    }
    if (enabled.has('balance')) {
      const bad = balance(side, cut);
      if (bad) return bad;
    }
  }

  // Checkerboard balance for each empty area (tiles with no lines yet).
  if (enabled.has('balance')) {
    const degree = new Int32Array(n);
    for (const e of state.segments) for (const c of edgeCells(p, e)) degree[c]++;
    const empty = new Uint8Array(n);
    for (const c of cells) if (degree[c] === 0) empty[c] = 1;
    const done = new Uint8Array(n);
    for (const c of cells) {
      if (!empty[c] || done[c]) continue;
      const area = reach(c, [], empty);
      for (const t of area) done[t] = 1;
      if (area.length < 2 || area.length === cells.length) continue;
      const inArea = new Set(area);
      const cut: number[] = [];
      for (const t of area) for (const e of adj[t]) if (!inArea.has(other(e, t))) cut.push(e);
      if (!cut.length) continue;
      const bad = balance(area, cut);
      if (bad) return bad;
    }
  }
  return out;
}
