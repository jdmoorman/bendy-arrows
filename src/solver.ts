import { cellCount, cellRC, edgeBetween, endpointCells, modeOf, openCells, type Puzzle } from './model';

export type SolveStatus = 'none' | 'unique' | 'multiple' | 'aborted';

export interface SolveResult {
  status: SolveStatus;
  /** Up to `maxSolutions` distinct solutions, each a sorted list of edge ids. */
  solutions: number[][];
  /** Human-readable explanation of the status. */
  reason: string;
  /** Search nodes visited. */
  nodes: number;
}

export interface SolveOptions {
  /** Stop after this many distinct solutions (default 2, enough to decide uniqueness). */
  maxSolutions?: number;
  /** Give up after visiting this many search nodes (default 20 million). */
  nodeLimit?: number;
  /** Polled periodically; return true to abort the search. */
  shouldAbort?: () => boolean;
  /** Called periodically with the node count. */
  onProgress?: (nodes: number) => void;
}

export interface ParityResult {
  ok: boolean;
  /** Open tiles on each checkerboard colour ("A" = (row + col) even). */
  a: number;
  b: number;
  /** In path mode, the colour every path end must be on, if forced (0 = A, 1 = B). */
  endColor: 0 | 1 | null;
  reason: string;
}

export function colorOf(p: Puzzle, cell: number): 0 | 1 {
  const [r, c] = cellRC(p, cell);
  return ((r + c) & 1) as 0 | 1;
}

/**
 * Checkerboard parity: every segment joins an A tile to a B tile, so a path or
 * loop alternates colours. A loop needs equal counts; a path needs counts that
 * differ by at most one, with both ends on the majority colour if they differ.
 */
export function parityCheck(p: Puzzle): ParityResult {
  let a = 0;
  let b = 0;
  for (const c of openCells(p)) colorOf(p, c) === 0 ? a++ : b++;
  const counts = `${a} A tiles vs ${b} B tiles`;
  if (modeOf(p) === 'cycle') {
    if (a !== b) return { ok: false, a, b, endColor: null, reason: `A loop needs equal checkerboard counts, but there are ${counts}.` };
    return { ok: true, a, b, endColor: null, reason: `Checkerboard counts balance (${counts}).` };
  }
  if (Math.abs(a - b) > 1) {
    return { ok: false, a, b, endColor: null, reason: `A path's checkerboard counts can differ by at most one, but there are ${counts}.` };
  }
  const endColor: 0 | 1 | null = a === b ? null : a > b ? 0 : 1;
  const eps = endpointCells(p);
  if (endColor !== null) {
    const name = endColor === 0 ? 'A' : 'B';
    if (eps.some((c) => colorOf(p, c) !== endColor)) {
      return { ok: false, a, b, endColor, reason: `With ${counts}, both path ends must be on ${name} tiles, but a path end is on a ${name === 'A' ? 'B' : 'A'} tile.` };
    }
  } else if (eps.length === 2 && colorOf(p, eps[0]) === colorOf(p, eps[1])) {
    return { ok: false, a, b, endColor, reason: `With ${counts}, the path ends must be on different colours, but both path ends are on the same colour.` };
  }
  return { ok: true, a, b, endColor, reason: `Checkerboard counts are consistent (${counts}).` };
}

export function solve(p: Puzzle, opts: SolveOptions = {}): SolveResult {
  const maxSolutions = opts.maxSolutions ?? 2;
  const nodeLimit = opts.nodeLimit ?? 20_000_000;
  const n = cellCount(p);
  const open = openCells(p);
  const openCount = open.length;
  const isCycle = modeOf(p) === 'cycle';
  const endpoints = endpointCells(p);

  const result = (status: SolveStatus, reason: string, solutions: number[][] = [], nodes = 0): SolveResult => ({
    status,
    solutions,
    reason,
    nodes,
  });

  // --- Quick structural checks -------------------------------------------
  if (openCount === 0) return result('none', 'There are no open tiles.');
  for (const c of endpoints) if (p.blocked.has(c)) return result('none', 'A path end is on a black tile.');
  if (endpoints.length === 2 && endpoints[0] === endpoints[1] && openCount > 1) {
    return result('none', 'Both path ends are on the same tile.');
  }
  const cps = p.checkpoints;
  if (cps.some((c) => p.blocked.has(c))) return result('none', 'A checkpoint is on a black tile.');
  if (new Set(cps).size !== cps.length) return result('none', 'Two checkpoints are on the same tile.');
  if (isCycle && openCount < 4) return result('none', 'A loop needs at least four open tiles.');
  if (openCount === 1) {
    return result('unique', 'The single open tile is the whole path.', [[]]);
  }

  // Usable adjacency.
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const c of open) {
    const [r, col] = cellRC(p, c);
    const cand = [r > 0 ? c - p.w : -1, col > 0 ? c - 1 : -1, col < p.w - 1 ? c + 1 : -1, r < p.h - 1 ? c + p.w : -1];
    for (const nb of cand) {
      if (nb >= 0 && !p.blocked.has(nb) && !p.walls.has(edgeBetween(p, c, nb))) adj[c].push(nb);
    }
  }
  for (const c of open) {
    if (adj[c].length === 0) return result('none', 'A tile is completely walled off.');
    if (isCycle && adj[c].length < 2) return result('none', 'A tile has only one way in or out, so it cannot be on a loop.');
  }
  const deadEnds = open.filter((c) => adj[c].length === 1);
  if (!isCycle) {
    if (deadEnds.length > 2) return result('none', `${deadEnds.length} tiles have only one way in or out, but a path has only two ends.`);
    const fixed = new Set(endpoints);
    const freeEnds = 2 - endpoints.length;
    const unfixedDead = deadEnds.filter((c) => !fixed.has(c));
    if (unfixedDead.length > freeEnds) return result('none', 'A dead-end tile cannot be a path end.');
  }

  const parity = parityCheck(p);
  if (!parity.ok) return result('none', parity.reason);

  // --- Search -------------------------------------------------------------
  const visited = new Uint8Array(n);
  const order: number[] = [];
  let visitedCount = 0;
  let nodes = 0;
  let aborted = false;
  const found = new Map<string, number[]>();
  let start = -1;
  // Checkpoints must be entered in order: cpIndex[cell] is its position (or -1).
  const cpIndex = new Int32Array(n).fill(-1);
  cps.forEach((c, i) => (cpIndex[c] = i));
  let nextCp = 0;

  const done = () => aborted || found.size >= maxSolutions;

  const record = (closing: boolean) => {
    const edges: number[] = [];
    for (let i = 1; i < order.length; i++) edges.push(edgeBetween(p, order[i - 1], order[i]));
    if (closing) edges.push(edgeBetween(p, order[order.length - 1], order[0]));
    edges.sort((x, y) => x - y);
    const key = edges.join(',');
    if (!found.has(key)) found.set(key, edges);
  };

  // Necessary conditions on the unvisited region, given the path currently ends at `cur`.
  const feasible = (cur: number): boolean => {
    const remaining = openCount - visitedCount;
    if (remaining === 0) return true;
    // Connectivity: every unvisited tile must be reachable from cur through unvisited tiles.
    const stack = [cur];
    const mark = new Uint8Array(n);
    mark[cur] = 1;
    let reached = 0;
    while (stack.length) {
      const c = stack.pop()!;
      for (const nb of adj[c]) {
        if (!visited[nb] && !mark[nb]) {
          mark[nb] = 1;
          reached++;
          stack.push(nb);
        }
      }
    }
    if (reached < remaining) return false;
    // Degree: each unvisited tile needs two ways in/out, except a path's final tile.
    let ends = 0;
    let startLinks = 0;
    for (const u of open) {
      if (visited[u]) continue;
      let avail = 0;
      for (const nb of adj[u]) {
        if (isCycle && nb === start) startLinks++;
        if (!visited[nb] || nb === cur || (isCycle && nb === start)) avail++;
      }
      if (avail < 2) {
        if (avail === 0 || isCycle) return false;
        if (endpoints.length === 2 && u !== endpoints[1]) return false;
        if (++ends > 1) return false;
      }
    }
    // A loop's last tile must be next to the start.
    if (isCycle && startLinks === 0) return false;
    return true;
  };

  const onwardCount = (c: number) => {
    let k = 0;
    for (const nb of adj[c]) if (!visited[nb]) k++;
    return k;
  };

  const dfs = (cur: number): void => {
    nodes++;
    if ((nodes & 0xffff) === 0) {
      opts.onProgress?.(nodes);
      if (nodes > nodeLimit || opts.shouldAbort?.()) aborted = true;
    }
    if (aborted) return;

    if (visitedCount === openCount) {
      if (isCycle) {
        if (adj[cur].includes(start)) record(true);
      } else if (endpoints.length < 2 || cur === endpoints[1]) {
        record(false);
      }
      return;
    }

    const candidates = adj[cur].filter((nb) => !visited[nb]);
    if (candidates.length > 1) candidates.sort((x, y) => onwardCount(x) - onwardCount(y));
    for (const next of candidates) {
      if (visited[next]) continue;
      if (endpoints.length === 2 && next === endpoints[1] && visitedCount + 1 < openCount) continue;
      const k = cpIndex[next];
      if (k >= 0 && k !== nextCp) continue; // a checkpoint out of turn
      if (k >= 0) nextCp++;
      visited[next] = 1;
      visitedCount++;
      order.push(next);
      if (feasible(next)) dfs(next);
      order.pop();
      visitedCount--;
      visited[next] = 0;
      if (k >= 0) nextCp--;
      if (done()) return;
    }
  };

  const runFrom = (s: number) => {
    start = s;
    nextCp = cpIndex[s] === 0 ? 1 : 0;
    visited[s] = 1;
    visitedCount = 1;
    order.push(s);
    if (feasible(s)) dfs(s);
    order.pop();
    visited[s] = 0;
    visitedCount = 0;
  };

  let starts: number[];
  if (isCycle) {
    // Every tile is on the loop; start where branching is lowest.
    starts = [open.reduce((best, c) => (adj[c].length < adj[best].length ? c : best), open[0])];
  } else if (endpoints.length > 0) {
    starts = [endpoints[0]];
  } else if (deadEnds.length > 0) {
    starts = [deadEnds[0]];
  } else {
    starts = open.filter((c) => parity.endColor === null || colorOf(p, c) === parity.endColor);
  }
  for (const s of starts) {
    runFrom(s);
    if (done()) break;
  }

  const solutions = [...found.values()];
  if (aborted && solutions.length < maxSolutions) {
    return result('aborted', `Search stopped after ${nodes.toLocaleString()} steps with ${solutions.length} solution(s) found so far.`, solutions, nodes);
  }
  if (solutions.length === 0) return result('none', 'No solution exists.', solutions, nodes);
  if (solutions.length === 1) return result('unique', 'The puzzle has exactly one solution.', solutions, nodes);
  return result('multiple', 'The puzzle has more than one solution.', solutions, nodes);
}
