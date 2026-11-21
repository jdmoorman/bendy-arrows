import { ALL_RULES, runLogic } from './logic';
import { checkSolution } from './rules';
import { cellCount, cellRC, clonePuzzle, edgeBetween, edgeCells, edgeCount, endpointCells, isUsableEdge, openCells, portCell, portCount, portEnd, type Puzzle } from './model';

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
  /** Only accept solutions that use all of these segments (e.g. what the player has drawn). */
  mustUse?: Iterable<number>;
  /** Break ties between equally good moves in a random order from this seed, to find varied solutions. */
  seed?: number;
  /**
   * Try the logic rules before searching (default true). Each rule only marks what
   * holds in every solution, so when they finish the path it is the only one: no
   * search needed. That matters on open boards, where the search can take very long.
   */
  logicFirst?: boolean;
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
 * Checkerboard parity: every segment joins an A tile to a B tile, so a path
 * alternates colours. Its counts differ by at most one, with both ends on the
 * majority colour if they differ.
 */
export function parityCheck(p: Puzzle): ParityResult {
  let a = 0;
  let b = 0;
  for (const c of openCells(p)) colorOf(p, c) === 0 ? a++ : b++;
  const counts = `${a} A tiles vs ${b} B tiles`;
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
  const required = [...(opts.mustUse ?? [])];
  const requiredAt: number[][] = Array.from({ length: n }, () => []);
  for (const e of required) {
    if (!isUsableEdge(p, e)) return result('none', 'A required segment crosses a wall or a black tile.');
    const [a, b] = edgeCells(p, e);
    requiredAt[a].push(b);
    requiredAt[b].push(a);
  }
  for (const c of open) if (requiredAt[c].length > 2) return result('none', 'A tile has more than two required segments.');
  for (const c of endpoints) if (requiredAt[c].length > 1) return result('none', 'A path end has two required segments.');
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
  }
  const deadEnds = open.filter((c) => adj[c].length === 1);
  if (deadEnds.length > 2) return result('none', `${deadEnds.length} tiles have only one way in or out, but a path has only two ends.`);
  const fixed = new Set(endpoints);
  const freeEnds = 2 - endpoints.length;
  const unfixedDead = deadEnds.filter((c) => !fixed.has(c));
  if (unfixedDead.length > freeEnds) return result('none', 'A dead-end tile cannot be a path end.');

  const parity = parityCheck(p);
  if (!parity.ok) return result('none', parity.reason);

  if ((opts.logicFirst ?? true) && !required.length) {
    const logic = runLogic(p, ALL_RULES);
    // Double-check the finished board, so a rule's mistake can never claim a wrong solution.
    if (logic.solved && checkSolution(p, logic.state.segments).solved) {
      return result('unique', 'The logic rules solve it, so the solution is unique.', [[...logic.state.segments].sort((a, b) => a - b)]);
    }
  }

  // --- Search -------------------------------------------------------------
  const visited = new Uint8Array(n);
  const order: number[] = [];
  let visitedCount = 0;
  let nodes = 0;
  let aborted = false;
  const found = new Map<string, number[]>();

  const done = () => aborted || found.size >= maxSolutions;
  // Seeded random numbers (xorshift) for varied tie-breaking.
  let seedState = (opts.seed ?? 0) | 0 || 0x9e3779b9;
  const rand = opts.seed === undefined ? null : () => {
    seedState ^= seedState << 13;
    seedState ^= seedState >>> 17;
    seedState ^= seedState << 5;
    return (seedState >>> 0) / 4294967296;
  };

  const record = () => {
    const edges: number[] = [];
    for (let i = 1; i < order.length; i++) edges.push(edgeBetween(p, order[i - 1], order[i]));
    if (required.length) {
      const set = new Set(edges);
      if (!required.every((e) => set.has(e))) return;
    }
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
    for (const u of open) {
      if (visited[u]) continue;
      let avail = 0;
      for (const nb of adj[u]) {
        if (!visited[nb] || nb === cur) avail++;
      }
      if (avail < 2) {
        if (avail === 0) return false;
        if (endpoints.length === 2 && u !== endpoints[1]) return false;
        if (++ends > 1) return false;
      }
    }
    return true;
  };

  const onwardCount = (c: number) => {
    let k = 0;
    for (const nb of adj[c]) if (!visited[nb]) k++;
    return k;
  };

  const dfs = (cur: number, prev: number): void => {
    nodes++;
    if ((nodes & 0xffff) === 0) {
      opts.onProgress?.(nodes);
      if (nodes > nodeLimit || opts.shouldAbort?.()) aborted = true;
    }
    if (aborted) return;

    if (visitedCount === openCount) {
      if (endpoints.length < 2 || cur === endpoints[1]) record();
      return;
    }

    // Required segments at cur (other than the one we arrived on) force the next step.
    let forced = -1;
    for (const g of requiredAt[cur]) {
      if (g === prev) continue;
      if (visited[g]) return; // the path can't step back onto itself
      if (forced >= 0) return;
      forced = g;
    }
    const candidates = forced >= 0 ? [forced] : adj[cur].filter((nb) => !visited[nb]);
    if (candidates.length > 1) {
      // Shuffle first so the (stable) sort breaks ties randomly, when asked to.
      if (rand) for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      candidates.sort((x, y) => onwardCount(x) - onwardCount(y));
    }
    for (const next of candidates) {
      if (visited[next]) continue;
      if (endpoints.length === 2 && next === endpoints[1] && visitedCount + 1 < openCount) continue;
      visited[next] = 1;
      visitedCount++;
      order.push(next);
      if (feasible(next)) dfs(next, cur);
      order.pop();
      visitedCount--;
      visited[next] = 0;
      if (done()) return;
    }
  };

  const runFrom = (s: number) => {
    visited[s] = 1;
    visitedCount = 1;
    order.push(s);
    // A path's start is an end, so it can carry at most one required segment.
    if (requiredAt[s].length <= 1 && feasible(s)) dfs(s, -1);
    order.pop();
    visited[s] = 0;
    visitedCount = 0;
  };

  let starts: number[];
  if (endpoints.length > 0) {
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

export interface UnionResult {
  /** The first solve's verdict (unique, multiple, none or aborted). */
  status: SolveStatus;
  /** Every border used by at least one solution found. */
  edges: number[];
  /** Borders whose search hit the node limit, so it isn't known whether a solution uses them. */
  unchecked: number[];
  /**
   * The border a wall on which would rule out the most of the solutions found while
   * keeping at least one of them, or null (unique, none, or nothing to suggest).
   */
  suggestedWall: { edge: number; rulesOut: number; found: number } | null;
}

/**
 * Every line that belongs to at least one solution.
 *
 * 1. Solve once (that's the verdict: unique, multiple, none or aborted).
 *    Then run the logic rules until they stall: they hold for every
 *    solution, so their lines go into every search below as required, and their X marks
 *    become walls (no solution uses them, so those borders need no search at all).
 * 2. Sample: quick solves that break ties in random orders, each finding a different
 *    solution and marking its lines, until ten in a row add nothing new.
 * 3. For each border still unmarked, look for a solution that must use it: a few quick
 *    randomised tries, then one bounded full search. A border whose search runs out of
 *    steps is reported as unchecked rather than guessed.
 * `onUpdate` sees the lines found so far as they grow.
 */
export function solutionUnion(
  p: Puzzle,
  opts: {
    nodeLimit?: number;
    perEdgeNodeLimit?: number;
    onUpdate?: (edges: number[]) => void;
    shouldAbort?: () => boolean;
    /** Seed the searches with what the logic rules deduce (default true; off for comparison). */
    useLogic?: boolean;
    /** Only solutions that use all of these lines count (e.g. lines drawn in the editor). */
    mustUse?: Iterable<number>;
  } = {},
): UnionResult {
  const must = [...(opts.mustUse ?? [])];
  const first = solve(p, { maxSolutions: 2, nodeLimit: opts.nodeLimit, shouldAbort: opts.shouldAbort, mustUse: must });
  const used = new Set(first.solutions.flat());
  if (first.status !== 'multiple') return { status: first.status, edges: [...used], unchecked: [], suggestedWall: null };
  // Every distinct solution found, and how many of them use each border (for the suggestion).
  const seen = new Set<string>();
  const uses = new Map<number, number>();
  const count = (sol: number[]) => {
    const key = sol.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (const e of sol) uses.set(e, (uses.get(e) ?? 0) + 1);
  };
  for (const sol of first.solutions) count(sol);
  // What every solution must do, from the logic rules: required lines, and X'd borders as walls.
  let required: number[] = must;
  let q = p;
  if (opts.useLogic ?? true) {
    const logic = runLogic(p, ALL_RULES, { segments: new Set(must), xs: new Set() });
    if (!logic.contradiction) {
      required = [...logic.state.segments];
      q = clonePuzzle(p);
      for (const x of logic.state.xs) q.walls.add(x);
      for (const e of required) used.add(e);
    }
  }
  const report = () => opts.onUpdate?.([...used]);
  const add = (sol: number[] | undefined) => {
    if (sol) count(sol);
    const before = used.size;
    for (const x of sol ?? []) used.add(x);
    if (used.size > before) report();
    return used.size > before;
  };
  report();
  // 2. Random samples.
  for (let seed = 1, quiet = 0; seed <= 200 && quiet < 10 && !opts.shouldAbort?.(); seed++) {
    quiet = add(solve(q, { maxSolutions: 1, mustUse: required, seed, nodeLimit: 20_000 }).solutions[0]) ? 0 : quiet + 1;
  }
  // 3. One search per border still unmarked.
  const unchecked: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) {
    // Borders the logic X'd are walls in q: no solution uses them.
    if (used.has(e) || !isUsableEdge(q, e)) continue;
    if (opts.shouldAbort?.()) {
      unchecked.push(e);
      continue;
    }
    let settled = false;
    for (let seed = 1; seed <= 4 && !settled; seed++) {
      const r = solve(q, { maxSolutions: 1, mustUse: [...required, e], seed, nodeLimit: 50_000 });
      if (r.solutions.length) settled = add(r.solutions[0]) || true;
      else if (r.status === 'none') settled = true; // no solution uses it
    }
    if (settled) continue;
    const r = solve(q, { maxSolutions: 1, mustUse: [...required, e], nodeLimit: opts.perEdgeNodeLimit ?? 500_000, shouldAbort: opts.shouldAbort });
    if (r.solutions.length) add(r.solutions[0]);
    else if (r.status === 'aborted') unchecked.push(e);
  }
  // Suggest the wall that rules out the most solutions found but not all of them (a border
  // every found solution uses would most likely leave no solution at all).
  let suggestedWall: UnionResult['suggestedWall'] = null;
  for (const [edge, n] of uses) {
    if (n >= seen.size) continue;
    if (!suggestedWall || n > suggestedWall.rulesOut) suggestedWall = { edge, rulesOut: n, found: seen.size };
  }
  return { status: first.status, edges: [...used], unchecked, suggestedWall };
}

/** End placements that give a puzzle with too few ends at least one solution. */
export interface EndOption {
  /** The ports each end could use: every frame side of its tile (the puzzle's own end first, if it has one, as just its port). */
  ports: [number[], number[]];
  status: 'unique' | 'multiple';
  /** Lines its solutions use: the solution, or with `union`, every line some solution uses (as far as found). */
  edges: number[];
}

/**
 * For a puzzle with fewer than two ends: every way to place the missing ones (keeping the end
 * it has) that gives at least one solution, and whether that solution is the only one. Ends on
 * the same tile behave alike (a corner tile has two frame sides), so each tile is tried once
 * and its ports share the verdict. `onFound` sees each as it's found; placements whose search
 * runs out of steps are counted as unchecked.
 */
export function endPlacements(
  p: Puzzle,
  opts: {
    nodeLimit?: number;
    shouldAbort?: () => boolean;
    onFound?: (o: EndOption) => void;
    /** For placements with several solutions, find every line some solution uses (slower). */
    union?: boolean;
  } = {},
): { options: EndOption[]; unchecked: number } {
  const byCell = new Map<number, number[]>();
  for (let port = 0; port < portCount(p); port++) {
    const c = portCell(p, port);
    if (p.blocked.has(c)) continue;
    byCell.set(c, [...(byCell.get(c) ?? []), port]);
  }
  const fixed = p.endpoints[0]?.port;
  const cells = [...byCell.keys()];
  const pairs: [number, number][] = [];
  if (fixed !== undefined) {
    for (const c of cells) if (c !== portCell(p, fixed)) pairs.push([fixed, byCell.get(c)![0]]);
  } else {
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) pairs.push([byCell.get(cells[i])![0], byCell.get(cells[j])![0]]);
  }
  const options: EndOption[] = [];
  let unchecked = 0;
  for (const [a, b] of pairs) {
    if (opts.shouldAbort?.()) {
      unchecked++;
      continue;
    }
    const q = clonePuzzle(p);
    q.endpoints = [portEnd(a), portEnd(b)];
    if (!parityCheck(q).ok) continue;
    const r = solve(q, { maxSolutions: 2, nodeLimit: opts.nodeLimit ?? 200_000, shouldAbort: opts.shouldAbort });
    if (r.status === 'aborted') unchecked++;
    if (r.status !== 'unique' && r.status !== 'multiple') continue;
    // Every port of each end's tile works the same way.
    const edges =
      r.status === 'multiple' && opts.union
        ? (() => {
            const u = solutionUnion(q, { nodeLimit: opts.nodeLimit ?? 200_000, perEdgeNodeLimit: 100_000, shouldAbort: opts.shouldAbort });
            unchecked += u.unchecked.length ? 1 : 0;
            return u.edges;
          })()
        : [...new Set(r.solutions.flat())];
    const o: EndOption = { ports: [fixed !== undefined ? [a] : byCell.get(portCell(p, a))!, byCell.get(portCell(p, b))!], status: r.status, edges };
    options.push(o);
    opts.onFound?.(o);
  }
  return { options, unchecked };
}
