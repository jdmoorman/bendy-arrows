import { cellCount, edgeCells, endpointCells, isUsableEdge, openCells, type Puzzle } from './model';

/**
 * Whether the player may draw a segment on this edge.
 * Only black tiles and walls block a segment; loops, branches and other rule
 * violations are allowed while drawing and are reported by checkSolution.
 */
export function canPlace(p: Puzzle, e: number): boolean {
  return isUsableEdge(p, e);
}

/**
 * What a puzzle still needs before it has a path to find (null when ready): both
 * ends on the frame, or at least two numbers. Without them nothing fixes where the
 * path starts and stops, so it counts as having no solution.
 */
export function missingEnds(p: Puzzle): string | null {
  if (!p.endpoints.length && !p.checkpoints.length) return 'Place the entrance and exit on the frame (or at least two numbers) first.';
  if (p.endpoints.length === 1) return 'Place a second end on the frame first — a path needs an entrance and an exit.';
  if (p.checkpoints.length === 1) return 'Place a second checkpoint first — the path runs from 1 to the highest number.';
  return null;
}

export interface CheckResult {
  solved: boolean;
  /** Open cells that no segment touches. */
  unvisited: Set<number>;
  /** Cells with more than two segments. */
  branches: Set<number>;
  /** Path ends that are not allowed (in the wrong place). */
  badEnds: Set<number>;
  /** Edges forming a closed loop that should not be one. */
  loopEdges: Set<number>;
  /** Segments on black tiles or walls (should not happen through the UI). */
  illegalEdges: Set<number>;
  /** Number of separate pieces the drawn segments form. */
  pieces: number;
  /** Checkpoint tiles reached out of order along an otherwise complete path. */
  checkpointErrors: Set<number>;
  message: string;
}

export function checkSolution(p: Puzzle, segments: Iterable<number>): CheckResult {
  const segs = new Set(segments);
  const n = cellCount(p);
  const degree = new Int32Array(n);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const illegalEdges = new Set<number>();

  for (const e of segs) {
    if (!isUsableEdge(p, e)) illegalEdges.add(e);
    const [a, b] = edgeCells(p, e);
    degree[a]++;
    degree[b]++;
    adj[a].push(b);
    adj[b].push(a);
  }

  const open = openCells(p);
  const unvisited = new Set<number>();
  const branches = new Set<number>();
  const ends: number[] = [];
  for (const c of open) {
    if (degree[c] === 0) unvisited.add(c);
    else if (degree[c] === 1) ends.push(c);
    else if (degree[c] > 2) branches.add(c);
  }

  const badEnds = new Set<number>();
  const eps = endpointCells(p);
  if (eps.length > 0) {
    const allowed = new Set(eps);
    for (const c of ends) {
      // With one fixed endpoint the other end is free, but only one free end may exist.
      if (!allowed.has(c) && eps.length === 2) badEnds.add(c);
    }
    if (eps.length === 1) {
      const free = ends.filter((c) => c !== eps[0]);
      if (free.length > 1) for (const c of free) badEnds.add(c);
    }
  }

  // Connected components of the drawn segments, and loop detection.
  const seen = new Uint8Array(n);
  const loopEdges = new Set<number>();
  let pieces = 0;
  const segList = [...segs];
  const edgesByCell: number[][] = Array.from({ length: n }, () => []);
  for (const e of segList) {
    const [a, b] = edgeCells(p, e);
    edgesByCell[a].push(e);
    edgesByCell[b].push(e);
  }
  for (let start = 0; start < n; start++) {
    if (seen[start] || degree[start] === 0) continue;
    pieces++;
    const comp: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const nb of adj[c]) {
        if (!seen[nb]) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    const compEdges = new Set<number>();
    for (const c of comp) for (const e of edgesByCell[c]) compEdges.add(e);
    // A connected piece with at least as many edges as cells contains a loop.
    const hasLoop = compEdges.size >= comp.length;
    if (hasLoop) for (const e of cycleEdges(comp, edgesByCell, p)) loopEdges.add(e);
  }

  const structurallySolved =
    open.length > 0 &&
    illegalEdges.size === 0 &&
    unvisited.size === 0 &&
    branches.size === 0 &&
    badEnds.size === 0 &&
    loopEdges.size === 0 &&
    (open.length === 1
      ? segs.size === 0 && eps.every((c) => c === open[0])
      : pieces === 1 && ends.length === 2 && eps.every((c) => ends.includes(c)));
  const checkpointErrors = structurallySolved ? checkpointOrderErrors(p, adj) : new Set<number>();
  const solved = structurallySolved && checkpointErrors.size === 0;

  return {
    solved,
    checkpointErrors,
    unvisited,
    branches,
    badEnds,
    loopEdges,
    illegalEdges,
    pieces,
    message: describe({ solved, unvisited, branches, badEnds, loopEdges, illegalEdges, pieces, checkpointErrors }),
  };
}

/**
 * Walk a complete path from checkpoint 1 and return the checkpoints that are
 * not reached in their turn (empty when the order is right).
 */
function checkpointOrderErrors(p: Puzzle, adj: number[][]): Set<number> {
  const cps = p.checkpoints;
  const errors = new Set<number>();
  if (cps.length < 2) return errors;
  const index = new Map(cps.map((c, i) => [c, i]));
  let next = 0;
  let prev = -1;
  let cur = cps[0];
  for (;;) {
    const k = index.get(cur);
    if (k !== undefined) {
      if (k === next) next++;
      else errors.add(cur);
    }
    const nb = adj[cur].find((x) => x !== prev);
    if (nb === undefined) break;
    prev = cur;
    cur = nb;
  }
  for (let i = next; i < cps.length; i++) if (!errors.size) errors.add(cps[i]);
  return errors;
}

/** Edges that lie on some cycle within a component (i.e. non-bridge edges). */
function cycleEdges(comp: number[], edgesByCell: number[][], p: Puzzle): Set<number> {
  // Repeatedly strip degree-1 cells; what remains (with degree >= 2) lies on or between cycles.
  const deg = new Map<number, number>();
  const alive = new Set<number>();
  for (const c of comp) {
    deg.set(c, edgesByCell[c].length);
    alive.add(c);
  }
  const queue = comp.filter((c) => deg.get(c)! <= 1);
  while (queue.length) {
    const c = queue.pop()!;
    if (!alive.has(c)) continue;
    alive.delete(c);
    for (const e of edgesByCell[c]) {
      const [a, b] = edgeCells(p, e);
      const o = a === c ? b : a;
      if (!alive.has(o)) continue;
      const d = deg.get(o)! - 1;
      deg.set(o, d);
      if (d <= 1) queue.push(o);
    }
  }
  const out = new Set<number>();
  for (const c of alive) {
    for (const e of edgesByCell[c]) {
      const [a, b] = edgeCells(p, e);
      if (alive.has(a) && alive.has(b)) out.add(e);
    }
  }
  return out;
}

function describe(r: Omit<CheckResult, 'message'>): string {
  if (r.solved) return 'Solved — one path through every tile!';
  const issues: string[] = [];
  if (r.illegalEdges.size) issues.push('segments cross walls or black tiles');
  if (r.branches.size) issues.push(`${r.branches.size} tile(s) branch`);
  if (r.loopEdges.size) issues.push('the path contains a loop');
  if (r.badEnds.size) issues.push('path ends in the wrong place');
  if (r.pieces > 1) issues.push(`${r.pieces} separate pieces`);
  if (r.checkpointErrors.size) issues.push('the numbers are not visited in order');
  if (r.unvisited.size) issues.push(`${r.unvisited.size} tile(s) not visited`);
  if (!issues.length) issues.push('not complete');
  return 'Not solved: ' + issues.join(', ') + '.';
}
