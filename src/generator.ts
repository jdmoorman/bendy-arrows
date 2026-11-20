import { ALL_RULES, applyStep, fastStep, type LogicOptions, type LogicState, type RuleId } from './logic';
import {
  cellCount,
  cellRC,
  clonePuzzle,
  createPuzzle,
  edgeBetween,
  edgeCells,
  edgeCount,
  neighbors,
  openCells,
  orientEnds,
  portEnd,
  portCell,
  portId,
  transformPuzzle,
  type Puzzle,
  type Side,
  type Transform,
} from './model';
import { solve } from './solver';

/**
 * Procedural puzzle generation. Everything is driven by a seeded random
 * generator and node-limited searches, so the same options and seed always
 * give the same puzzle.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'veryhard';
/** Which clues may be used: walls and black tiles, only walls, or only black tiles. */
export type ClueKind = 'mixed' | 'walls' | 'tiles';

export interface GenOptions {
  w: number;
  h: number;
  /** The difficulties wanted: it stops at the first puzzle rated one of these (all of them if empty). */
  difficulties: Difficulty[];
  clues: ClueKind;
  /** Remove every clue that isn't needed for a unique solution. */
  minimal: boolean;
  /** At most this many obstacles (walls plus black tiles); no limit if missing. */
  maxObstacles?: number;
  /**
   * Lay out the starting walls and black tiles instead of scattering black tiles (the path is
   * then chosen around them, and minimal clues may remove them). False to give up this try.
   */
  prepare?: (p: Puzzle, rand: () => number) => boolean;
  /** Share of tiles to start black, as [min, max] (default depends on `clues`); minimal clues removes unneeded ones. */
  blackDensity?: [number, number];
  /** How many tries before settling for the closest (default: no limit, keep trying until one matches or it's cancelled). */
  attempts?: number;
  seed: number;
}

/** Walls plus black tiles: what the sparsity limit counts. (Ends don't count.) */
export function obstacleCount(p: Puzzle): number {
  return p.walls.size + p.blocked.size;
}

export interface GenResult {
  puzzle: Puzzle;
  /** How hard the puzzle actually is. */
  difficulty: Difficulty;
  attempts: number;
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'veryhard'];

/** Search budget for each uniqueness check. */
const NODE_LIMIT = 300_000;

/** mulberry32: a small, fast seeded random generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/** Whether repeatedly applying `rules` solves the puzzle. */
export function logicSolves(p: Puzzle, rules: RuleId[], opts: LogicOptions = {}): boolean {
  let state: LogicState = { segments: new Set(), xs: new Set() };
  // Every round adds a mark, so there can't be more rounds than borders.
  for (let i = 0; i <= edgeCount(p); i++) {
    const step = fastStep(p, state, rules, opts);
    if (step.solved) return true;
    if (step.contradiction || (!step.segments.length && !step.xs.length)) return false;
    state = applyStep(state, step);
  }
  return false;
}

/** The rules difficulty is rated with: all of them. */
export const RATING_RULES: RuleId[] = ALL_RULES;

/** Every rated rule except Checkerboard balance: what an Easy puzzle may need. */
export const EASY_RULES: RuleId[] = RATING_RULES.filter((r) => r !== 'balance');

/** Largest Checkerboard balance area (in tiles) a Medium puzzle may need. */
export const MEDIUM_BALANCE_AREA = 8;

/**
 * Easy: solved without Checkerboard balance. Medium: needs it, but only on
 * areas of up to MEDIUM_BALANCE_AREA tiles. Hard: needs bigger areas. Very
 * hard: beyond all the rules.
 */
export function rateDifficulty(p: Puzzle, opts: LogicOptions = {}): Difficulty {
  if (logicSolves(p, EASY_RULES, opts)) return 'easy';
  if (logicSolves(p, RATING_RULES, { ...opts, balanceMaxArea: MEDIUM_BALANCE_AREA })) return 'medium';
  if (logicSolves(p, RATING_RULES, opts)) return 'hard';
  return 'veryhard';
}

/**
 * Generate a puzzle with a unique solution, trying until one matches one of the
 * difficulties wanted. With no `attempts` limit it keeps trying (the app cancels it from
 * the generator sheet); with a limit it gives back the closest found.
 */
export function generate(opts: GenOptions, onProgress?: (attempt: number) => void): GenResult {
  const rand = seededRandom(opts.seed);
  const wanted = opts.difficulties.length ? opts.difficulties : DIFFICULTIES;
  let best: GenResult | null = null;
  for (let attempt = 1; attempt <= (opts.attempts ?? Infinity); attempt++) {
    onProgress?.(attempt);
    const p = attemptPuzzle(opts, rand);
    if (!p) continue;
    if (opts.maxObstacles !== undefined && obstacleCount(p) > opts.maxObstacles) continue;
    const difficulty = rateDifficulty(p);
    // Paths with ends on opposite sides come in on the left and go out on the right.
    const result = { puzzle: orientEnds(p, true), difficulty, attempts: attempt };
    if (wanted.includes(difficulty)) return result;
    // How far from the nearest wanted difficulty, for settling on the closest when attempts run out.
    const off = (r: GenResult) => Math.min(...wanted.map((d) => Math.abs(DIFFICULTIES.indexOf(r.difficulty) - DIFFICULTIES.indexOf(d))));
    if (!best || off(result) < off(best)) best = result;
  }
  if (best) return best;
  if (opts.maxObstacles !== undefined) {
    throw new Error(`Couldn't find a puzzle with at most ${opts.maxObstacles} obstacle${opts.maxObstacles === 1 ? '' : 's'}. Try a smaller size, a higher limit, or another seed.`);
  }
  throw new Error("Couldn't make a puzzle with these options. Try another size or clue type.");
}

function shuffle<T>(rand: () => number, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

const pick = <T>(rand: () => number, xs: T[]): T => xs[Math.floor(rand() * xs.length)];

/** One try at a puzzle; null if this try didn't work out. */
function attemptPuzzle(opts: GenOptions, rand: () => number): Puzzle | null {
  const { w, h, clues } = opts;
  const p = createPuzzle(w, h);
  if (opts.prepare) {
    if (!opts.prepare(p, rand) || !openTilesOk(p)) return null;
  } else {
    const [lo, hi] = opts.blackDensity ?? (clues === 'tiles' ? [0.08, 0.2] : [0, 0.08]);
    const density = clues === 'walls' ? 0 : lo + rand() * (hi - lo);
    if (!addBlackTiles(p, rand, density)) return null;
  }

  let unique: Puzzle | null;
  if (clues === 'tiles') {
    unique = uniqueByTiles(p, rand);
  } else {
    const order = randomHamiltonian(p, rand);
    if (!order) return null;
    unique = uniqueFromSolution(p, order, rand);
  }
  if (!unique) return null;
  if (opts.minimal || opts.maxObstacles !== undefined) minimise(unique, rand);
  if (opts.maxObstacles !== undefined && obstacleCount(unique) > opts.maxObstacles) {
    if (!sparsify(unique, opts, rand)) return null;
  }
  if (isSymmetric(unique)) return null;
  return unique;
}

/** Scatter black tiles, keeping the open tiles connected. False if that isn't possible. */
function addBlackTiles(p: Puzzle, rand: () => number, density: number): boolean {
  const n = cellCount(p);
  const want = Math.floor(n * density);
  const order = shuffle(rand, Array.from({ length: n }, (_, i) => i));
  const tryAdd = (c: number) => {
    if (p.blocked.has(c)) return false;
    p.blocked.add(c);
    if (openTilesOk(p)) return true;
    p.blocked.delete(c);
    return false;
  };
  for (const c of order) {
    if (p.blocked.size >= want) break;
    tryAdd(c);
  }
  return true;
}

/** Open tiles are connected and none is a dead end (black tiles only; walls aren't checked). */
export function openTilesOk(p: Puzzle): boolean {
  const open = openCells(p);
  if (open.length < 4) return false;
  for (const c of open) if (neighbors(p, c).filter((m) => !p.blocked.has(m)).length < 2) return false;
  const seen = new Set([open[0]]);
  const queue = [open[0]];
  while (queue.length) {
    const c = queue.pop()!;
    for (const m of neighbors(p, c)) {
      if (!p.blocked.has(m) && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen.size === open.length;
}

const onFrame = (p: Puzzle, c: number) => {
  const [r, col] = cellRC(p, c);
  return r === 0 || col === 0 || r === p.h - 1 || col === p.w - 1;
};

/**
 * A random Hamiltonian path through the open tiles (as a tile order), made
 * by "backbite" moves from a starting path, with both ends on the frame.
 */
export function randomHamiltonian(p: Puzzle, rand: () => number): number[] | null {
  const start = startingPath(p);
  if (!start) return null;
  let path = start;
  const n = path.length;
  const open = (m: number) => !p.blocked.has(m);
  const backbite = () => {
    if (rand() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const options = neighbors(p, end).filter((m) => open(m) && m !== path[path.length - 2] && !p.walls.has(edgeBetween(p, end, m)));
    if (!options.length) return;
    const i = path.indexOf(pick(rand, options));
    // Join the end to tile i and reverse the part after it.
    path = path.slice(0, i + 1).concat(path.slice(i + 1).reverse());
  };
  for (let k = 0; k < 20 * n; k++) backbite();
  const done = () => onFrame(p, path[0]) && onFrame(p, path[path.length - 1]);
  for (let k = 0; k < 200 * n && !done(); k++) backbite();
  return done() ? path : null;
}

/** Any Hamiltonian path: a snake on an open grid, otherwise the solver's first find. */
function startingPath(p: Puzzle): number[] | null {
  if (!p.blocked.size && !p.walls.size) {
    const out: number[] = [];
    for (let r = 0; r < p.h; r++) for (let i = 0; i < p.w; i++) out.push(r * p.w + (r % 2 ? p.w - 1 - i : i));
    return out;
  }
  // With no ends set, the solver finds a path between any two tiles.
  const r = solve({ ...p, endpoints: [] }, { maxSolutions: 1, nodeLimit: NODE_LIMIT });
  const edges = r.solutions[0];
  if (!edges) return null;
  // Start the walk at one end of the path: a tile with a single line.
  const lines = new Map<number, number>();
  for (const e of edges) for (const c of edgeCells(p, e)) lines.set(c, (lines.get(c) ?? 0) + 1);
  const start = edges.length ? [...lines].find(([, k]) => k === 1)![0] : openCells(p)[0];
  return walkEdges(p, edges, start);
}

/** Tile order of a path given by its edges, starting from `start`. */
function walkEdges(p: Puzzle, edges: number[], start: number): number[] {
  const nb = new Map<number, number[]>();
  for (const e of edges) {
    const [a, b] = edgeCells(p, e);
    nb.set(a, [...(nb.get(a) ?? []), b]);
    nb.set(b, [...(nb.get(b) ?? []), a]);
  }
  const out = [start];
  let prev = -1;
  let cur = start;
  for (;;) {
    const next = (nb.get(cur) ?? []).find((m) => m !== prev);
    if (next === undefined || next === start) break;
    prev = cur;
    cur = next;
    out.push(cur);
  }
  return out;
}

/** A frame end just outside tile `c`. */
export function portFor(p: Puzzle, c: number, rand: () => number) {
  const [r, col] = cellRC(p, c);
  const sides: [Side, number][] = [];
  if (r === 0) sides.push(['top', col]);
  if (r === p.h - 1) sides.push(['bottom', col]);
  if (col === 0) sides.push(['left', r]);
  if (col === p.w - 1) sides.push(['right', r]);
  const [side, i] = pick(rand, sides);
  return portEnd(portId(p, side, i));
}

/**
 * Turn a chosen solution into a unique puzzle: set its ends, then add walls
 * that rule out each other solution found.
 */
function uniqueFromSolution(p: Puzzle, order: number[], rand: () => number): Puzzle | null {
  const solution = new Set<number>();
  for (let i = 1; i < order.length; i++) solution.add(edgeBetween(p, order[i - 1], order[i]));
  p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];

  for (let round = 0; round < 4 * order.length; round++) {
    const r = solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT });
    if (r.status === 'unique') return p;
    if (r.status === 'none') return null;
    // Edges another solution uses but ours doesn't (or, if the search gave up, any edge ours doesn't use).
    const other = r.solutions.find((s) => s.some((e) => !solution.has(e)));
    let candidates = other ? other.filter((e) => !solution.has(e)) : [];
    if (!candidates.length) {
      candidates = [];
      for (const c of order) for (const m of neighbors(p, c)) if (c < m && !p.blocked.has(m) && !solution.has(edgeBetween(p, c, m))) candidates.push(edgeBetween(p, c, m));
      candidates = candidates.filter((e) => !p.walls.has(e));
    }
    if (!candidates.length) return null;
    p.walls.add(pick(rand, candidates));
  }
  return null;
}

/** How many solutions (capped), for comparing puzzles while searching. */
function solutionCount(p: Puzzle, cap: number): number {
  const r = solve(p, { maxSolutions: cap, nodeLimit: NODE_LIMIT });
  if (r.status === 'aborted' && r.solutions.length < cap) return cap; // unknown: treat as many
  return r.solutions.length;
}

/**
 * Black tiles only, for frame ends: there are no walls to add, so keep
 * adding black tiles while that narrows the solutions down.
 */
function uniqueByTiles(p: Puzzle, rand: () => number): Puzzle | null {
  const CAP = 40;
  // Take the ends from a random path, so there is at least one solution.
  const order = randomHamiltonian(p, rand);
  if (!order) return null;
  p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
  let count = solutionCount(p, CAP);
  if (count === 0) return null;
  for (let tries = 0; tries < 6 * cellCount(p) && count > 1; tries++) {
    const candidates = openCells(p);
    const add = [pick(rand, candidates)];
    for (const c of add) p.blocked.add(c);
    if (p.endpoints.some((e) => p.blocked.has(portCell(p, e.port))) || !openTilesOk(p)) {
      for (const c of add) p.blocked.delete(c);
      continue;
    }
    const next = solutionCount(p, CAP);
    if (next === 0 || next > count) {
      for (const c of add) p.blocked.delete(c);
      continue;
    }
    count = next;
  }
  return count === 1 ? p : null;
}

/**
 * The editor's Simplify: take away, in random order, every obstacle the unique solution
 * doesn't need. Null if the puzzle doesn't have exactly one solution to begin with.
 */
export function simplifyPuzzle(p: Puzzle, seed: number): Puzzle | null {
  if (solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT }).status !== 'unique') return null;
  const q = clonePuzzle(p);
  minimise(q, seededRandom(seed));
  return q;
}

/** Remove each clue that isn't needed for the solution to stay unique. */
function minimise(p: Puzzle, rand: () => number): void {
  const clues = [...[...p.walls].map((id) => ({ wall: true, id })), ...[...p.blocked].map((id) => ({ wall: false, id }))];
  for (const clue of shuffle(rand, clues)) {
    const set = clue.wall ? p.walls : p.blocked;
    set.delete(clue.id);
    const stillUnique = (clue.wall || openTilesOk(p)) && solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT }).status === 'unique';
    if (!stillUnique) set.add(clue.id);
  }
}

/** Whether the walls and black tiles look the same after turning or mirroring the board. */
export function isSymmetric(p: Puzzle): boolean {
  if (p.walls.size + p.blocked.size < 2) return false;
  const turns: Transform[][] = [['rotateRight', 'rotateRight'], ['flipH'], ['flipV']];
  if (p.w === p.h) turns.push(['rotateRight'], ['rotateLeft'], ['rotateRight', 'flipH'], ['rotateLeft', 'flipH']);
  const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));
  return turns.some((ts) => {
    const q = ts.reduce((acc, t) => transformPuzzle(acc, t), p);
    return same(q.walls, p.walls) && same(q.blocked, p.blocked);
  });
}

/** How many obstacle pairs to try replacing before giving up on a puzzle. */
const SPARSIFY_TRIES = 40;

/**
 * Bring a unique puzzle down to the obstacle limit: repeatedly take two
 * obstacles away and look for a single new one that makes the solution
 * unique again. False if it can't get there.
 */
function sparsify(p: Puzzle, opts: GenOptions, rand: () => number): boolean {
  const max = opts.maxObstacles ?? Infinity;
  const isUnique = () => solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT }).status === 'unique';
  type Obstacle = { wall: boolean; id: number };
  const list = (): Obstacle[] => [...[...p.walls].map((id) => ({ wall: true, id })), ...[...p.blocked].map((id) => ({ wall: false, id }))];
  const put = (o: Obstacle, on: boolean) => {
    const set = o.wall ? p.walls : p.blocked;
    if (on) set.add(o.id);
    else set.delete(o.id);
  };
  const keep = new Set(p.endpoints.map((e) => portCell(p, e.port)));
  for (let tries = 0; tries < SPARSIFY_TRIES && obstacleCount(p) > max; tries++) {
    const obstacles = shuffle(rand, list());
    if (obstacles.length < 2) return false;
    const [a, b] = obstacles;
    put(a, false);
    put(b, false);
    if (isUnique()) continue; // both were spare
    // Candidates: walls on borders some solution uses, or black tiles, as the clue kind allows.
    const r = solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT });
    const used = new Set(r.solutions.flat());
    const candidates: Obstacle[] = [];
    if (opts.clues !== 'tiles') for (const e of used) if (!p.walls.has(e)) candidates.push({ wall: true, id: e });
    if (opts.clues !== 'walls') {
      for (const c of shuffle(rand, openCells(p)).slice(0, 40)) if (!keep.has(c)) candidates.push({ wall: false, id: c });
    }
    let found = false;
    for (const c of shuffle(rand, candidates).slice(0, 60)) {
      put(c, true);
      if (c.wall || openTilesOk(p)) {
        if (isUnique()) {
          found = true;
          break;
        }
      }
      put(c, false);
    }
    if (!found) {
      put(a, true);
      put(b, true);
    }
  }
  return obstacleCount(p) <= max;
}
