import { cellCount, cellEdges, edgeCells, edgeCount, endpointCells, isHorizontalEdge, isUsableEdge, neighbors, openCells, type Puzzle } from './model';

/**
 * Simple, local deduction rules for the editor's logic helper. A "step"
 * looks at the current deductions, finds everything every enabled rule can
 * conclude from them, and applies all of it at once.
 */

export type RuleId =
  | 'corners'
  | 'passages'
  | 'continue'
  | 'noLoops'
  | 'noFinish'
  | 'noSeal'
  | 'bottlenecks'
  | 'balance'
  | 'imbalance';

export interface RuleInfo {
  id: RuleId;
  label: string;
  hint: string;
}

export const RULES: RuleInfo[] = [
  {
    id: 'continue',
    label: 'Continue',
    hint: 'A tile whose remaining ways out are exactly what it still needs takes them — including a path end with only one way out.',
  },
  { id: 'corners', label: 'Corners', hint: 'A tile with only two ways out, at a right angle, uses both.' },
  { id: 'passages', label: 'Passages', hint: 'A tile walled in on two opposite sides gets a line straight through.' },
  { id: 'noLoops', label: 'No early loops', hint: 'X out a border that would close a loop before every tile is used.' },
  {
    id: 'noFinish',
    label: 'No early finish',
    hint: 'X out a border that would join both ends of the path before every tile is used.',
  },
  {
    id: 'noSeal',
    label: 'No sealed areas',
    hint: 'X out a border whose line would wall off tiles the path could then never reach.',
  },
  {
    id: 'bottlenecks',
    label: 'Bottlenecks',
    hint: 'An area reachable through only two borders uses both (or just one, when one end of the path is inside).',
  },
  {
    id: 'balance',
    label: 'Checkerboard balance',
    hint: 'The path alternates colours, so it crosses into an area with as many shaded tiles as white ones on shaded and white tiles equally often.',
  },
];

/**
 * Checkerboard balance for areas with more of one colour than the other: the path crosses
 * in on the commoner colour twice as many extra times as that colour has extra tiles.
 * Hard to spot on the grid, so it is left out of RULES (and so of ALL_RULES and every
 * hint, rating and logic run); pass it explicitly to use it.
 */
export const IMBALANCE_RULE: RuleInfo = {
  id: 'imbalance',
  label: 'Checkerboard imbalance',
  hint: 'The path alternates colours, so it crosses into an area on its commoner colour twice as many extra times as that colour has extra tiles.',
};

/** The rules from before the advanced ones were added (for migrating saved choices). */
export const BASIC_RULES: RuleId[] = ['continue', 'corners', 'passages', 'noLoops'];

export const ALL_RULES: RuleId[] = RULES.map((r) => r.id);

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
 * How many path segments each open tile must have: one at a path end, two
 * elsewhere. With fewer than two ends this is wrong for the missing ends'
 * tiles, so rules that rely on it may find contradictions or wrong marks.
 */
function needs(p: Puzzle): Int8Array {
  const ends = endpointCells(p);
  const need = new Int8Array(cellCount(p));
  for (const c of openCells(p)) need[c] = 2;
  for (const c of ends) need[c] = 1;
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
  /** How big the application is, for picking the simplest hint, when there is no area. */
  size?: number;
  /** Borders out of the area the path can still cross (open or already drawn), for picking the simplest hint. */
  exits?: number;
}

type Analysis =
  | ({ kind: 'contradiction' } & Contradiction)
  | { kind: 'solved' }
  | { kind: 'open'; deductions: Deduction[] };

/** Loops this small (a 2×2 or 2×3 ring of tiles) are obvious: no X is needed to rule them out. */
const OBVIOUS_LOOP = 6;

/**
 * Borders that are closed because a tile next to them already has all its lines, or
 * because a line there would close an obvious little loop (OBVIOUS_LOOP tiles or fewer).
 * These are taken as understood: no rule step or hint is spent on them.
 */
function closedBorders(p: Puzzle, state: LogicState, need: Int8Array): Set<number> {
  const closed = new Set<number>();
  for (const c of openCells(p)) {
    const edges = cellEdges(p, c);
    if (edges.filter((e) => state.segments.has(e)).length !== need[c]) continue;
    for (const e of edges) if (!state.segments.has(e)) closed.add(e);
  }
  for (const { edge, size } of earlyLoopEdges(p, state, need)) if (size <= OBVIOUS_LOOP) closed.add(edge);
  return closed;
}

/** Everything the rules can conclude from a state (each deduction is new). */
/** Where Checkerboard balance and Number crossings look for areas to check. */
export type AreaSource = 'cuts' | 'cuts3' | 'rects' | 'rooms' | 'chains';
export const AREA_SOURCES: AreaSource[] = ['cuts', 'cuts3', 'rects', 'rooms', 'chains'];

export interface LogicOptions {
  /** Only use Checkerboard balance on areas of at most this many tiles. */
  balanceMaxArea?: number;
  /** Which kinds of area to check (all of them if missing). */
  areaSources?: AreaSource[];
  /**
   * How to find areas cut off by three borders: 'labels' (fast, the default) or the
   * original 'search', kept to check the two agree.
   */
  threeCuts?: 'labels' | 'search';
}

function analyse(p: Puzzle, state: LogicState, enabled: Set<RuleId>, opts: LogicOptions = {}): Analysis {
  const need = needs(p);
  const open = openCells(p);
  const closed = closedBorders(p, state, need);
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
    for (const { edge: e, size } of earlyLoopEdges(p, state, need)) {
      if (size <= OBVIOUS_LOOP) continue; // already closed: obvious
      deductions.push({ rule: 'noLoops', cell: edgeCells(p, e)[0], segments: [], xs: [e], size });
    }
  }
  if (enabled.has('noFinish')) deductions.push(...earlyFinishEdges(p, state, need, closed, open.length));
  if (enabled.has('noSeal')) deductions.push(...sealingEdges(p, state, need, closed));
  const sources = new Set(opts.areaSources ?? AREA_SOURCES);
  const maxArea = opts.balanceMaxArea ?? Infinity;
  const colours = colourRules(enabled);
  if (enabled.has('bottlenecks') || colours.size) {
    // Areas cut off by three borders are slow to find, so they wait for the pass below.
    const found = areaRules(p, state, need, closed, enabled, maxArea, new Set([...sources].filter((x) => x !== 'cuts3')));
    if ('reason' in found) return { kind: 'contradiction', ...found };
    deductions.push(...found);
  }
  // Last resort: areas cut off by three borders, only when nothing else applies.
  if (colours.size && sources.has('cuts3') && !deductions.length) {
    const found = areaRules(p, state, need, closed, colours, maxArea, new Set<AreaSource>(['cuts3']), opts.threeCuts ?? 'labels');
    if ('reason' in found) return { kind: 'contradiction', ...found };
    deductions.push(...found);
  }
  return { kind: 'open', deductions };
}

/** The checkerboard rules among those enabled. */
function colourRules(enabled: Set<RuleId>): Set<RuleId> {
  return new Set([...enabled].filter((r) => r === 'balance' || r === 'imbalance'));
}

/** Every deduction the rules make from a state (empty if stuck, solved or contradictory). */
export function deductions(p: Puzzle, state: LogicState, rules: Iterable<RuleId>, opts: LogicOptions = {}): Deduction[] {
  const an = analyse(p, state, new Set(rules), opts);
  return an.kind === 'open' ? an.deductions : [];
}

export function logicStep(p: Puzzle, state: LogicState, rules: Iterable<RuleId>, opts: LogicOptions = {}): StepResult {
  return stepFrom(p, state, analyse(p, state, new Set(rules), opts));
}

/** The marks an analysis adds, checked for rules that disagree. */
function stepFrom(p: Puzzle, state: LogicState, an: Analysis): StepResult {
  const result: StepResult = { segments: [], xs: [], byRule: {}, solved: false };
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

/**
 * Rules grouped from cheapest to most expensive, for running them to the end quickly.
 * (Hints use HINT_ORDER instead: there the choice of move matters, here only speed.)
 */
const SPEED_TIERS: RuleId[][] = [
  ['continue', 'corners', 'passages', 'noLoops', 'noFinish'],
  ['noSeal'],
  ['bottlenecks', 'balance', 'imbalance'],
];

/**
 * One round of deductions, cheapest rules first: stop at the first group of rules that
 * finds anything. Applying cheap moves before computing expensive ones reaches the same
 * end, since each rule only ever adds marks that hold in every solution.
 */
export function fastStep(p: Puzzle, state: LogicState, rules: Iterable<RuleId>, opts: LogicOptions = {}): StepResult {
  const chosen = new Set(rules);
  const tiered = new Set(SPEED_TIERS.flat());
  // Rules not in any group (none today) run last.
  const tiers = [...SPEED_TIERS, [...chosen].filter((r) => !tiered.has(r))];
  let last: StepResult = { segments: [], xs: [], byRule: {}, solved: false };
  for (const tier of tiers) {
    const use = tier.filter((r) => chosen.has(r));
    if (!use.length) continue;
    last = logicStep(p, state, use, opts);
    if (last.contradiction || last.solved || last.segments.length || last.xs.length) return last;
  }
  return last;
}

/** Where running the rules to the end got to. */
export interface LogicRun {
  state: LogicState;
  /** How many rounds of deductions were applied. */
  rounds: number;
  solved: boolean;
  contradiction?: Contradiction;
}

/** Apply every deduction the rules find, round after round, until they find nothing more. */
export function runLogic(p: Puzzle, rules: Iterable<RuleId>, start: LogicState = { segments: new Set(), xs: new Set() }, opts: LogicOptions = {}): LogicRun {
  const chosen = [...rules];
  let state = start;
  // Every round adds a mark, so there can't be more rounds than borders.
  const limit = edgeCount(p) + 1;
  for (let rounds = 0; rounds < limit; rounds++) {
    const step = fastStep(p, state, chosen, opts);
    if (step.contradiction) return { state, rounds, solved: false, contradiction: step.contradiction };
    if (step.solved) return { state, rounds, solved: true };
    if (!step.segments.length && !step.xs.length) return { state, rounds, solved: false };
    state = applyStep(state, step);
  }
  return { state, rounds: limit, solved: false };
}

/** The rules outside the editor's "Easy rules" group. */
export const ADVANCED_RULES: RuleId[] = ['bottlenecks', 'balance', 'imbalance'];

/** One hint a player needed: its rule, and for area rules how many tiles the area had. */
export interface HintStep {
  rule: RuleId;
  area?: number;
}

/**
 * What solving is like for a player who applies the easy rules until they get stuck, then
 * asks for a hint, and repeats: the hints they'd need, in order, and whether that finishes
 * the puzzle or leaves them stuck with no hint to give.
 */
export function hintJourney(p: Puzzle, opts: LogicOptions = {}): { steps: HintStep[]; outcome: 'solved' | 'stuck' } {
  const easy = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
  const steps: HintStep[] = [];
  let state: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i <= edgeCount(p); i++) {
    const run = runLogic(p, easy, state, opts);
    state = run.state;
    if (run.solved) return { steps, outcome: 'solved' };
    if (run.contradiction) return { steps, outcome: 'stuck' };
    // Stuck on the easy rules: take the hint the Hint button would give.
    const h = findHint(p, state, HINT_ORDER, opts);
    if (h.kind === 'solved') return { steps, outcome: 'solved' };
    if (h.kind !== 'deduction') return { steps, outcome: 'stuck' };
    const d = h.deduction;
    // Only the area rules report a size.
    const areaRule = d.rule === 'balance' || d.rule === 'imbalance' || d.rule === 'bottlenecks';
    steps.push(areaRule && d.cells ? { rule: d.rule, area: d.cells.length } : { rule: d.rule });
    state = applyStep(state, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
  }
  return { steps, outcome: 'stuck' };
}

/** How hidden the moves are, round by round (see `searchMetrics`). */
export interface SearchMetrics {
  /** The most undecided borders per available move at any round: high when one move hides on an open board. */
  tightest: number;
  /** Undecided borders per available move, added up over every round: the whole search. */
  effort: number;
  /** Rounds where the easy rules had nothing and all the rules were needed. */
  hardRounds: number;
  /** The rules ran out (or contradicted) before the end. */
  stuck: boolean;
}

/**
 * How hard the moves are to find. In each round, count the places a move can be made (the
 * easy rules' moves, or when there are none, every rule's), then make them (only the hint's
 * move, when the easy rules had none, as in `hintJourney`). A place is a
 * group of deductions sharing a mark, so a corner's two lines, or a line both of its tiles
 * force, are one place. Each round scores undecided borders per place: one move on a mostly
 * open board scores high, the last move on a nearly full one scores low.
 */
export function searchMetrics(p: Puzzle, opts: LogicOptions = {}): SearchMetrics {
  const easy = new Set(ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r)));
  const all = new Set(ALL_RULES);
  const need = needs(p);
  const out: SearchMetrics = { tightest: 0, effort: 0, hardRounds: 0, stuck: false };
  let state: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i <= edgeCount(p); i++) {
    let an = analyse(p, state, easy, opts);
    let hard = false;
    if (an.kind === 'open' && !an.deductions.length) {
      an = analyse(p, state, all, opts);
      hard = true;
    }
    if (an.kind === 'solved') return out;
    if (an.kind === 'contradiction' || !an.deductions.length) {
      out.stuck = true;
      return out;
    }
    if (hard) out.hardRounds++;
    const places = movePlaces(an.deductions, state);
    const closed = closedBorders(p, state, need);
    let undecided = 0;
    for (let e = 0; e < edgeCount(p); e++) {
      if (isUsableEdge(p, e) && !state.segments.has(e) && !state.xs.has(e) && !closed.has(e)) undecided++;
    }
    const score = undecided / Math.max(1, places);
    out.tightest = Math.max(out.tightest, score);
    out.effort += score;
    // Easy moves are all made at once; a hard round makes just the move a hint would show, as in
    // the hint journey, and the easy rules carry on from there.
    const pick = hard ? simplest(an.deductions) : undefined;
    const step = stepFrom(p, state, pick ? { kind: 'open', deductions: [pick] } : an);
    if (step.contradiction || (!step.segments.length && !step.xs.length)) {
      out.stuck = true;
      return out;
    }
    state = applyStep(state, step);
  }
  out.stuck = true;
  return out;
}

/** Groups of deductions that share a new mark: each group is one place to make a move. */
function movePlaces(ds: Deduction[], state: LogicState): number {
  const parent = ds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byEdge = new Map<number, number>();
  const fresh = new Set<number>();
  ds.forEach((d, i) => {
    for (const e of [...d.segments, ...d.xs]) {
      if (state.segments.has(e) || state.xs.has(e)) continue;
      fresh.add(i);
      const j = byEdge.get(e);
      if (j === undefined) byEdge.set(e, i);
      else parent[find(i)] = find(j);
    }
  });
  return new Set([...fresh].map(find)).size;
}

/** Simplest rules first: the order hints are chosen in. */
export const HINT_ORDER: RuleId[] = ['continue', 'corners', 'passages', 'noLoops', 'noFinish', 'noSeal', 'bottlenecks', 'balance'];

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
export function findHint(p: Puzzle, state: LogicState, rules: Iterable<RuleId> = HINT_ORDER, opts: LogicOptions = {}): Hint {
  const allowed = new Set(rules);
  const order = HINT_ORDER.filter((r) => allowed.has(r));
  const an = analyse(p, state, new Set(order), opts);
  if (an.kind === 'contradiction') return { kind: 'mistake', cell: an.cell, cells: an.cells, text: an.hint };
  if (an.kind === 'solved') return { kind: 'solved', text: 'Every tile already has its lines.' };
  const d = simplest(an.deductions, order);
  if (d) return { kind: 'deduction', deduction: d, text: explain(p, state, d) };
  return { kind: 'none', text: 'No hint available.' };
}

/**
 * One-shot mode's hint: the simplest deduction that forces the stroke's next line out of
 * `head`, from the stroke alone (its lines, no X marks).
 */
export function findStrokeHint(p: Puzzle, stroke: Set<number>, head: number, opts: LogicOptions = {}): Hint {
  const state: LogicState = { segments: stroke, xs: new Set() };
  const an = analyse(p, state, new Set(HINT_ORDER), opts);
  if (an.kind === 'contradiction') return { kind: 'mistake', cell: an.cell, cells: an.cells, text: an.hint };
  if (an.kind === 'solved') return { kind: 'solved', text: 'Every tile already has its lines.' };
  const next = (d: Deduction) => d.segments.find((e) => !stroke.has(e) && edgeCells(p, e).includes(head));
  const d = simplest(an.deductions.filter((x) => next(x) !== undefined));
  if (!d) return { kind: 'none', text: 'The rules can’t tell where the stroke goes next from here.' };
  // Show only the lines that carry the stroke on, one after another from its tip (a corner's
  // two lines, say); the rule may force others elsewhere too.
  const chain = [next(d)!];
  let tip = edgeCells(p, chain[0]).find((c) => c !== head)!;
  for (;;) {
    const e = d.segments.find((x) => !stroke.has(x) && !chain.includes(x) && edgeCells(p, x).includes(tip));
    if (e === undefined) break;
    chain.push(e);
    tip = edgeCells(p, e).find((c) => c !== tip)!;
  }
  return { kind: 'deduction', deduction: { ...d, segments: chain, xs: [] }, text: explain(p, state, d) };
}

/** The deduction a hint would show: simplest rule first, then the simplest use of it. */
function simplest(ds: Deduction[], order: RuleId[] = HINT_ORDER): Deduction | undefined {
  for (const rule of order) {
    // Within a rule, the simplest: the fewest exits (Checkerboard balance), then the smallest
    // area (or shortest piece), then the fewest marks, then top-left first.
    const exits = (x: Deduction) => x.exits ?? 0;
    const size = (x: Deduction) => x.cells?.length ?? x.size ?? 1;
    const marks = (x: Deduction) => x.segments.length + x.xs.length;
    const d = ds
      .filter((x) => x.rule === rule)
      .sort((a, b) => exits(a) - exits(b) || size(a) - size(b) || marks(a) - marks(b) || a.cell - b.cell)[0];
    if (d) return d;
  }
  return undefined;
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
 * one would close a loop, which the path never does.
 */
function earlyLoopEdges(p: Puzzle, state: LogicState, need: Int8Array): { edge: number; size: number }[] {
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
  const out: { edge: number; size: number }[] = [];
  for (const c of openCells(p)) {
    for (const e of cellEdges(p, c)) {
      const [a, b] = edgeCells(p, e);
      if (a !== c) continue; // each border once
      if (!isUsableEdge(p, e) || state.segments.has(e) || state.xs.has(e)) continue;
      if (degree[a] !== 1 || degree[b] !== 1 || need[a] !== 2 || need[b] !== 2) continue;
      const r = find(a);
      if (r !== find(b)) continue;
      out.push({ edge: e, size: size[r] });
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

/** No early finish: borders that would join both ends of the path before every tile is used. */
function earlyFinishEdges(p: Puzzle, state: LogicState, need: Int8Array, closed: Set<number>, openCount: number): Deduction[] {
  const out: Deduction[] = [];
  if (new Set(endpointCells(p)).size !== 2) return out;
  const { of, order } = drawnPieces(p, state);
  for (let e = 0; e < edgeCount(p); e++) {
    if (!isUsableEdge(p, e) || state.xs.has(e) || state.segments.has(e) || closed.has(e)) continue;
    const [a, b] = edgeCells(p, e);
    const A = order[of[a]];
    const B = order[of[b]];
    if (!A || !B || A === B) continue;
    const ends = [...A, ...B].filter((c) => need[c] === 1).length;
    if (ends >= 2 && A.length + B.length < openCount) {
      out.push({
        rule: 'noFinish',
        cell: a,
        segments: [],
        xs: [e],
        why: 'Joining the highlighted border would link both ends of the path before every tile is used, so it gets an X.',
      });
    }
  }
  return out;
}

/**
 * Bridges of the graph of open tiles and open borders (ignoring `skip`): the
 * borders whose removal splits it.
 */
function bridges(n: number, cells: number[], adj: number[][], other: (e: number, c: number) => number, skip: number, skip2 = -1): number[] {
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
        if (e === skip || e === skip2 || e === stackEdge[top]) continue;
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

/**
 * Every set of three borders that cuts the board in two, with no two of them doing so
 * already (and none a bridge), found with cycle-space labels instead of a search per pair.
 *
 * Take a spanning tree. Give each border not in the tree a random label, and each tree
 * border the XOR of the labels of the non-tree borders whose loops run over it. Every loop
 * crosses a cut an even number of times, so the labels of a cut's borders XOR to zero: a
 * bridge has label 0, a 2-cut is two equal labels, and a 3-cut is three labels that XOR to
 * zero. A chance match among non-cuts is possible (about 1 in 2^53 per pair), so the
 * caller checks each one.
 */
function threeBorderCuts(p: Puzzle, cells: number[], edges: number[], adj: number[][], other: (e: number, c: number) => number): number[][] {
  const n = cellCount(p);
  // Spanning tree by breadth-first search (the board is connected by now).
  const parentEdge = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const order = [cells[0]];
  seen[cells[0]] = 1;
  const inTree = new Set<number>();
  for (let i = 0; i < order.length; i++) {
    for (const e of adj[order[i]]) {
      const m = other(e, order[i]);
      if (seen[m]) continue;
      seen[m] = 1;
      parentEdge[m] = e;
      inTree.add(e);
      order.push(m);
    }
  }
  // Labels as two halves (32 + 21 bits, so the pair fits a JS number exactly).
  let x = 0x2545f491;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  const lo = new Map<number, number>();
  const hi = new Map<number, number>();
  const accLo = new Uint32Array(n);
  const accHi = new Uint32Array(n);
  for (const e of edges) {
    if (inTree.has(e)) continue;
    const l = rnd();
    const h = rnd() & 0x1fffff;
    lo.set(e, l);
    hi.set(e, h);
    for (const c of edgeCells(p, e)) {
      accLo[c] ^= l;
      accHi[c] ^= h;
    }
  }
  // Fold each tile's XOR into its parent, leaves first: what reaches a tree border is its label.
  for (let i = order.length - 1; i > 0; i--) {
    const v = order[i];
    const e = parentEdge[v];
    lo.set(e, accLo[v] >>> 0);
    hi.set(e, accHi[v]);
    const u = other(e, v);
    accLo[u] ^= accLo[v];
    accHi[u] ^= accHi[v];
  }
  const key = (e: number) => hi.get(e)! * 4294967296 + lo.get(e)!;
  // Borders by label, leaving out bridges (label 0).
  const live = edges.filter((e) => key(e) !== 0);
  const byKey = new Map<number, number[]>();
  live.forEach((e, i) => {
    const k = key(e);
    const list = byKey.get(k);
    if (list) list.push(i);
    else byKey.set(k, [i]);
  });
  const out: number[][] = [];
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const tLo = (lo.get(a)! ^ lo.get(b)!) >>> 0;
      const tHi = hi.get(a)! ^ hi.get(b)!;
      if (tLo === 0 && tHi === 0) continue; // a and b already make a 2-cut
      const ks = byKey.get(tHi * 4294967296 + tLo);
      if (!ks) continue;
      for (const k of ks) if (k > j) out.push([a, b, live[k]]);
    }
  }
  return out;
}

const MAX_CUTS = 4000;
/** Boards up to this many tiles have Checkerboard balance tried on every rectangle. */
const SMALL_BOARD = 100;
/** On bigger boards, rectangles up to this many tiles (and full-width or full-height strips). */
const RECT_AREA = 24;
/** Largest "room" grown from a tile for Checkerboard balance. */
const GROW_AREA = 30;

/**
 * Rules about areas of the board: the borders into an area (bottlenecks),
 * and its count of shaded and white tiles (checkerboard balance).
 */
function areaRules(
  p: Puzzle,
  state: LogicState,
  need: Int8Array,
  closed: Set<number>,
  enabled: Set<RuleId>,
  balanceMaxArea: number,
  use: Set<AreaSource>,
  threeCuts: 'labels' | 'search' = 'labels',
): Deduction[] | Contradiction {
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

  /**
   * Checkerboard balance. The path alternates colours, so inside any area it
   * runs in stretches whose shaded-minus-white count is +1, 0 or -1 depending
   * on the colours of the stretch's two end tiles. Each stretch ends where the
   * path crosses into the area or at a path end, so
   *   (crossings into shaded tiles + shaded path ends) - (same for white) = 2 x (shaded - white tiles).
   * The path must also cross at least once (twice when the count is even).
   */
  // Satisfied areas (see below), collected for chains when they're switched on.
  const colours = colourRules(enabled);
  const wantSatisfied = use.has('chains') && colours.size > 0;
  const satisfied: { cells: number[]; lines: number[] }[] = [];
  const balance = (area: number[]): Contradiction | null => {
    if (area.length < 2 || area.length >= cells.length || area.length > balanceMaxArea) return null;
    let diff = 0;
    for (const c of area) diff += shaded(c) ? 1 : -1;
    // Balanced areas (as many shaded tiles as white) and unbalanced ones are separate rules.
    const rule: RuleId = diff === 0 ? 'balance' : 'imbalance';
    if (!enabled.has(rule)) return null;
    const inArea = new Set(area);
    let endS = 0;
    let endW = 0;
    let needSum = 0;
    for (const c of area) {
      needSum += need[c];
      if (need[c] === 1) shaded(c) ? endS++ : endW++;
    }
    let sDrawn = 0;
    let wDrawn = 0;
    const sOpen: number[] = [];
    const wOpen: number[] = [];
    const sLines: number[] = [];
    const wLines: number[] = [];
    for (const t of area) {
      for (const e of adj[t]) {
        if (inArea.has(other(e, t))) continue;
        if (state.segments.has(e)) shaded(t) ? (sDrawn++, sLines.push(e)) : (wDrawn++, wLines.push(e));
        else (shaded(t) ? sOpen : wOpen).push(e);
      }
    }
    const target = 2 * diff - endS + endW; // shaded crossings minus white crossings
    const minCrossings = needSum % 2 ? 1 : 2;
    const sMinBalance = Math.max(sDrawn, wDrawn + target);
    const sMin = Math.max(sMinBalance, Math.ceil((minCrossings + target) / 2));
    const sMax = Math.min(sDrawn + sOpen.length, wDrawn + wOpen.length + target);
    // An area whose balance needs every border into one colour, all already drawn (by anyone),
    // is "satisfied": nothing new to say, but chains can carry on from it through those lines.
    if (wantSatisfied && sMin <= sMax) {
      if (!sOpen.length && sLines.length && sMin === sDrawn) satisfied.push({ cells: [...area], lines: sLines });
      if (!wOpen.length && wLines.length && sMin - target === wDrawn) satisfied.push({ cells: [...area], lines: wLines });
    }
    if (!sOpen.length && !wOpen.length) return null;
    if (sMin > sMax) {
      return {
        cell: Math.min(...area),
        cells: [...area],
        reason: "An area's shaded and white tiles can't balance.",
        hint: 'Something is off: the highlighted area has the wrong mix of shaded and white tiles for the ways in and out that are left — check the lines and X marks around it.',
      };
    }
    const wMin = sMin - target;
    const wMax = sMax - target;
    const lines: number[] = [];
    const xs: number[] = [];
    const doing: string[] = [];
    if (sOpen.length && sMin === sDrawn + sOpen.length) {
      lines.push(...sOpen);
      doing.push('use every open border into its shaded tiles');
    } else if (sOpen.length && sMax === sDrawn) {
      xs.push(...sOpen);
      doing.push('never cross into its shaded tiles');
    }
    if (wOpen.length && wMin === wDrawn + wOpen.length) {
      lines.push(...wOpen);
      doing.push('use every open border into its white tiles');
    } else if (wOpen.length && wMax === wDrawn) {
      xs.push(...wOpen);
      doing.push('never cross into its white tiles');
    }
    if (!doing.length) return null;
    const n = Math.abs(diff);
    const more = diff > 0 ? 'shaded' : 'white';
    const less = diff > 0 ? 'white' : 'shaded';
    const mix = n === 0 ? 'as many shaded tiles as white ones' : `${n} more ${more} tile${n === 1 ? '' : 's'} than ${less} ones`;
    const ends = endS + endW ? ' (a path end inside it counts as a way in)' : '';
    const law =
      n === 0
        ? 'so it must cross into the area on shaded tiles exactly as often as on white tiles'
        : `so it must cross into the area on ${more} tiles ${2 * n} more time${2 * n === 1 ? '' : 's'} than on ${less} tiles`;
    const entry =
      sMin <= sMinBalance ? '' : minCrossings === 1 ? ' It has to get into the area at least once.' : ' It has to get into the area and back out.';
    out.push({
      rule,
      cell: Math.min(...area),
      cells: [...area],
      exits: sDrawn + wDrawn + sOpen.length + wOpen.length,
      segments: lines,
      xs,
      why: `On the checkerboard, the highlighted area has ${mix}. The path alternates colours${ends}, ${law}.${entry} So it must ${doing.join(' and ')}.`,
    });
    return null;
  };

  /** Try the area rules that look at a whole area. */
  const checkArea = (area: number[]): Contradiction | null => (colours.size ? balance(area) : null);

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
    // (The cut feeds Bottlenecks above whatever the area sources; balance only if asked.)
    if (use.has('cuts')) {
      const bad = checkArea(side);
      if (bad) return bad;
    }
  }

  // Checkerboard balance for rectangles of the board: every rectangle on a small board;
  // on a big one, those of up to RECT_AREA tiles plus the strips that run all the way across.
  // (Empty areas, the groups of tiles with no lines yet, were dropped: every sample that
  // needed one was also covered by a cut, rectangle or room.)
  if (colours.size) {
    const small = p.w * p.h <= SMALL_BOARD;
    for (let rh = 1; rh <= (use.has('rects') ? p.h : 0); rh++) {
      for (let rw = 1; rw <= p.w; rw++) {
        if (rh * rw < 2 || (rh === p.h && rw === p.w)) continue;
        if (!small && rh * rw > RECT_AREA && rw !== p.w && rh !== p.h) continue;
        for (let r0 = 0; r0 + rh <= p.h; r0++) {
          for (let c0 = 0; c0 + rw <= p.w; c0++) {
            const area: number[] = [];
            for (let r = r0; r < r0 + rh; r++) for (let c = c0; c < c0 + rw; c++) if (!p.blocked.has(r * p.w + c)) area.push(r * p.w + c);
            const bad = checkArea(area);
            if (bad) return bad;
          }
        }
      }
    }
    // ...and, on small boards, for every area cut off by exactly three borders.
    if (use.has('cuts3') && cells.length <= SMALL_BOARD && threeCuts === 'labels') {
      for (const cut of threeBorderCuts(p, cells, edges, adj, other)) {
        const side = sideOf(cut);
        if (!side) continue; // a chance match of labels, not a real cut
        const bad = checkArea(side);
        if (bad) return bad;
      }
    }
    if (use.has('cuts3') && cells.length <= SMALL_BOARD && threeCuts === 'search') {
      const seen3 = new Set<string>();
      for (let i = 0; i < edges.length; i++) {
        const f = edges[i];
        if (isBridge.has(f)) continue;
        for (let j = i + 1; j < edges.length; j++) {
          const g = edges[j];
          if (isBridge.has(g)) continue;
          for (const h of bridges(n, cells, adj, other, f, g)) {
            if (isBridge.has(h)) continue;
            const key = [f, g, h].sort((a, b) => a - b).join(',');
            if (seen3.has(key)) continue;
            seen3.add(key);
            const side = sideOf([f, g, h]);
            if (!side) continue;
            const bad = checkArea(side);
            if (bad) return bad;
          }
        }
      }
    }
    // ...and for "rooms": from each tile, grow an area one tile at a time, always adding
    // the neighbour that leaves the fewest borders out of it, open or drawn (so it follows
    // walls and X marks), trying the balance at every size.
    const maxGrow = Math.min(GROW_AREA, Math.floor(cells.length / 2));
    const inArea = new Uint8Array(n);
    // Ties are broken by position. To find the same rooms whichever way the board is
    // turned or mirrored, a room that hits a tie is grown once for each of the 8
    // reading orders.
    const orders: Int32Array[] = [];
    for (const transpose of [false, true]) {
      for (const rDir of [1, -1]) {
        for (const cDir of [1, -1]) {
          const rank = new Int32Array(n);
          for (let i = 0; i < n; i++) {
            const r = Math.floor(i / p.w);
            const c = i % p.w;
            const rr = rDir === 1 ? r : p.h - 1 - r;
            const cc = cDir === 1 ? c : p.w - 1 - c;
            rank[i] = transpose ? cc * p.h + rr : rr * p.w + cc;
          }
          orders.push(rank);
        }
      }
    }
    // Rooms grown from different tiles or orders often come out the same: check each once.
    // An area is keyed by XOR-ing a random number per tile (two of them, for 53 bits).
    const keyLo = new Uint32Array(n);
    const keyHi = new Uint32Array(n);
    let x = 0x9e3779b9;
    const next = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return x >>> 0;
    };
    for (let i = 0; i < n; i++) {
      keyLo[i] = next();
      keyHi[i] = next() & 0x1fffff;
    }
    const checked = new Set<number>();
    // Per tile: its open borders, and running counts (while a room grows) of its
    // neighbours in the room and of its open borders that lead into the room.
    const nbrs = cells.length ? Array.from({ length: n }, (_, i) => (p.blocked.has(i) ? [] : neighbors(p, i).filter((m) => !p.blocked.has(m)))) : [];
    // Drawn lines count like open borders: they still cross the room's edge, so a full
    // tile isn't free to add (it would pull rooms away from the areas that matter).
    const openAdj = Array.from({ length: n }, (_, i) => adj[i] ?? []);
    const touchCount = new Int32Array(n);
    const openIn = new Int32Array(n);
    const join = (t: number, d: number) => {
      for (const m of nbrs[t]) touchCount[m] += d;
      for (const e of openAdj[t]) openIn[other(e, t)] += d;
    };
    // Candidates already looked at in this step (a tile can neighbour the room twice).
    const seenAt = new Int32Array(n);
    let stamp = 0;
    for (const seed of use.has('rooms') ? cells : []) {
      // The first reading order's room; the other orders can only differ after a tie.
      const first: number[] = [];
      let tied = false;
      for (let o = 0; o < orders.length && (o === 0 || tied); o++) {
        const rank = orders[o];
        const area = [seed];
        inArea[seed] = 1;
        join(seed, 1);
        let lo = keyLo[seed];
        let hi = keyHi[seed];
        // Areas this order shares with the first one were checked already.
        let same = o > 0;
        for (let size = 1; size < maxGrow; size++) {
          stamp++;
          let best = -1;
          let bestDelta = Infinity;
          let bestTouch = -1;
          let ties = 0;
          for (const t of area) {
            for (const m of nbrs[t]) {
              if (inArea[m] || seenAt[m] === stamp) continue;
              seenAt[m] = stamp;
              // Borders out of the room after adding m: m's own borders count +1 each,
              // except those into the room, which stop being borders (-1).
              const delta = openAdj[m].length - 2 * openIn[m];
              const touch = touchCount[m];
              if (delta < bestDelta || (delta === bestDelta && touch > bestTouch)) {
                best = m;
                bestDelta = delta;
                bestTouch = touch;
                ties = 0;
              } else if (delta === bestDelta && touch === bestTouch) {
                ties++;
                if (rank[m] < rank[best]) best = m;
              }
            }
          }
          if (best < 0) break;
          if (ties > 0 && o === 0) tied = true;
          area.push(best);
          inArea[best] = 1;
          join(best, 1);
          lo = (lo ^ keyLo[best]) >>> 0;
          hi ^= keyHi[best];
          if (o === 0) first.push(best);
          else if (same && first[size - 1] !== best) same = false;
          if (same) continue;
          const key = hi * 4294967296 + lo;
          if (checked.has(key)) continue;
          checked.add(key);
          const bad = checkArea(area);
          if (bad) return bad;
        }
        for (const t of area) {
          inArea[t] = 0;
          join(t, -1);
        }
      }
    }
    // ...and "chains": when an area's balance draws a line out of it, extend the area by the
    // tile across that line plus one of that tile's neighbours (one shaded tile and one white,
    // so the colour difference stays the same). If the bigger area's balance draws a new line
    // out of it, keep the bigger area and repeat from there.
    if (use.has('chains') && colours.size) {
      const tried = new Set<string>();
      const keyOf = (a: number[]) => [...a].sort((x, y) => x - y).join(',');
      const seeds: { cells: number[]; lines: number[] }[] = out
        .filter((d) => colours.has(d.rule) && d.cells && d.segments.length)
        .map((d) => ({ cells: d.cells!, lines: d.segments }));
      // Satisfied areas: chains carry on from them through their drawn lines, so a chain the
      // player (or earlier steps) worked part of the way along isn't lost.
      const seen = new Set(seeds.map((x) => keyOf(x.cells)));
      for (const x of satisfied) {
        const k = keyOf(x.cells);
        if (seen.has(k)) continue;
        seen.add(k);
        seeds.push(x);
      }
      for (const seed of seeds) {
        let area = seed.cells;
        let lines = seed.lines;
        for (let guard = 0; guard < n && lines.length; guard++) {
          const inA = new Set(area);
          let next: { area: number[]; lines: number[] } | null = null;
          for (const e of lines) {
            const t = edgeCells(p, e).find((c) => !inA.has(c));
            if (t === undefined || p.blocked.has(t)) continue;
            for (const m of neighbors(p, t)) {
              if (inA.has(m) || p.blocked.has(m)) continue;
              const bigger = [...area, t, m];
              const key = keyOf(bigger);
              if (tried.has(key)) continue;
              tried.add(key);
              const before = out.length;
              const bad = checkArea(bigger);
              if (bad) return bad;
              // A balance deduction's lines always cross its area's edge, so any is a new line out.
              const fresh = out.slice(before).find((d) => colours.has(d.rule) && d.segments.length);
              if (fresh) {
                next = { area: bigger, lines: fresh.segments };
                break;
              }
            }
            if (next) break;
          }
          if (!next) break;
          area = next.area;
          lines = next.lines;
        }
      }
    }
  }
  return out;
}

/** Empty, usable borders that are neither X'd nor closed by a full tile. */
function openBorders(p: Puzzle, state: LogicState, closed: Set<number>): number[] {
  const out: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) {
    if (isUsableEdge(p, e) && !state.xs.has(e) && !state.segments.has(e) && !closed.has(e)) out.push(e);
  }
  return out;
}

/**
 * No sealed areas: borders whose line would leave some tiles unreachable.
 * Drawing it can fill its two tiles, which closes their other borders; if
 * the tiles the path still needs then fall apart into separate groups, that
 * line can't be in the answer.
 */
function sealingEdges(p: Puzzle, state: LogicState, need: Int8Array, closed: Set<number>): Deduction[] {
  const n = cellCount(p);
  const cells = openCells(p);
  const degree = new Int32Array(n);
  for (const e of state.segments) for (const c of edgeCells(p, e)) degree[c]++;
  const usable: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < edgeCount(p); e++) {
    if (!isUsableEdge(p, e) || state.xs.has(e)) continue;
    const [a, b] = edgeCells(p, e);
    usable[a].push(e);
    usable[b].push(e);
  }
  const out: Deduction[] = [];
  const seen = new Uint8Array(n);
  for (const e of openBorders(p, state, closed)) {
    const [a, b] = edgeCells(p, e);
    const fillsA = degree[a] + 1 === need[a];
    const fillsB = degree[b] + 1 === need[b];
    if (!fillsA && !fillsB) continue; // nothing new gets closed
    // Is border f still passable once e is drawn?
    const passable = (f: number) => {
      if (f === e || state.segments.has(f)) return true;
      if (closed.has(f)) return false;
      const [x, y] = edgeCells(p, f);
      return !((fillsA && (x === a || y === a)) || (fillsB && (x === b || y === b)));
    };
    seen.fill(0);
    seen[cells[0]] = 1;
    const queue = [cells[0]];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      for (const f of usable[c]) {
        if (!passable(f)) continue;
        const [x, y] = edgeCells(p, f);
        const m = x === c ? y : x;
        if (!seen[m]) {
          seen[m] = 1;
          queue.push(m);
        }
      }
    }
    if (queue.length === cells.length) continue;
    const reached = new Set(queue);
    const rest = cells.filter((c) => !reached.has(c));
    const sealed = rest.length <= queue.length ? rest : queue;
    out.push({
      rule: 'noSeal',
      cell: a,
      cells: sealed,
      segments: [],
      xs: [e],
      why: 'A line on the highlighted border would wall off the highlighted tiles — the path could never reach them. So it gets an X.',
    });
  }
  return out;
}
