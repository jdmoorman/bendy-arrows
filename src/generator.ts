import { ALL_RULES, applyStep, logicStep, type LogicState, type RuleId } from './logic';
import {
  cellCount,
  cellRC,
  createPuzzle,
  edgeBetween,
  edgeCells,
  neighbors,
  openCells,
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

export type GenType = 'loop' | 'path' | 'checkpoints';
export type Difficulty = 'easy' | 'medium' | 'hard';
/** Which clues may be used: walls and black tiles, only walls, or only black tiles. */
export type ClueKind = 'mixed' | 'walls' | 'tiles';

export interface GenOptions {
  w: number;
  h: number;
  type: GenType;
  difficulty: Difficulty;
  clues: ClueKind;
  /** Remove every clue that isn't needed for a unique solution. */
  minimal: boolean;
  seed: number;
}

export interface GenResult {
  puzzle: Puzzle;
  /** How hard the puzzle actually is. */
  difficulty: Difficulty;
  attempts: number;
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** A sensible default size for each difficulty. */
export const DEFAULT_SIZE: Record<Difficulty, number> = { easy: 5, medium: 6, hard: 7 };

const MAX_ATTEMPTS = 400;
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
export function logicSolves(p: Puzzle, rules: RuleId[]): boolean {
  let state: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i < 500; i++) {
    const step = logicStep(p, state, rules);
    if (step.solved) return true;
    if (step.contradiction || (!step.segments.length && !step.xs.length)) return false;
    state = applyStep(state, step);
  }
  return false;
}

/** Every rule except Checkerboard balance: what an Easy puzzle may need. */
export const EASY_RULES: RuleId[] = ALL_RULES.filter((r) => r !== 'balance');

/**
 * Easy: solved without Checkerboard balance. Medium: needs Checkerboard
 * balance. Hard: beyond all the rules.
 */
export function rateDifficulty(p: Puzzle): Difficulty {
  if (logicSolves(p, EASY_RULES)) return 'easy';
  if (logicSolves(p, ALL_RULES)) return 'medium';
  return 'hard';
}

/**
 * Generate a puzzle with a unique solution, trying until one matches the
 * difficulty (or giving back the closest found).
 */
export function generate(opts: GenOptions, onProgress?: (attempt: number) => void): GenResult {
  if (opts.type === 'loop' && opts.clues === 'walls' && (opts.w * opts.h) % 2) {
    throw new Error('A loop needs an even number of tiles. Pick an even width or height, or allow black tiles.');
  }
  const rand = seededRandom(opts.seed);
  const target = DIFFICULTIES.indexOf(opts.difficulty);
  let best: GenResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress?.(attempt);
    const p = attemptPuzzle(opts, rand);
    if (!p) continue;
    const difficulty = rateDifficulty(p);
    const result = { puzzle: p, difficulty, attempts: attempt };
    if (difficulty === opts.difficulty) return result;
    const off = (r: GenResult) => Math.abs(DIFFICULTIES.indexOf(r.difficulty) - target);
    if (!best || off(result) < off(best)) best = result;
  }
  if (best) return best;
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

const shadedOf = (p: Puzzle, c: number) => {
  const [r, col] = cellRC(p, c);
  return (r + col) % 2;
};

/** One try at a puzzle; null if this try didn't work out. */
function attemptPuzzle(opts: GenOptions, rand: () => number): Puzzle | null {
  const { w, h, type, clues } = opts;
  const p = createPuzzle(w, h);
  const density = clues === 'walls' ? 0 : clues === 'tiles' ? 0.08 + rand() * 0.12 : rand() * 0.08;
  if (!addBlackTiles(p, rand, density, type === 'loop')) return null;

  let unique: Puzzle | null;
  if (clues === 'tiles' && type !== 'checkpoints') {
    unique = uniqueByTiles(p, opts, rand);
  } else {
    const order = randomHamiltonian(p, rand, type);
    if (!order) return null;
    unique = uniqueFromSolution(p, order, opts, rand);
  }
  if (!unique) return null;
  if (opts.minimal) minimise(unique, rand);
  if (isSymmetric(unique)) return null;
  return unique;
}

/**
 * Scatter black tiles, keeping the open tiles connected. For a loop, the
 * open tiles must also split evenly between shaded and white, so tiles of
 * the commoner colour are added until they do. False if that isn't possible.
 */
function addBlackTiles(p: Puzzle, rand: () => number, density: number, loop: boolean): boolean {
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
  if (!loop) return true;
  const balance = () => openCells(p).reduce((s, c) => s + (shadedOf(p, c) ? 1 : -1), 0);
  for (let b = balance(); b !== 0; b = balance()) {
    const colour = b > 0 ? 1 : 0;
    if (!order.some((c) => shadedOf(p, c) === colour && tryAdd(c))) return false;
  }
  return true;
}

/** Open tiles are connected and none is a dead end. */
function openTilesOk(p: Puzzle): boolean {
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
 * by "backbite" moves from a starting path. For a loop, the two ends are
 * adjacent; for frame ends, both ends are on the frame.
 */
function randomHamiltonian(p: Puzzle, rand: () => number, type: GenType): number[] | null {
  const start = startingPath(p);
  if (!start) return null;
  let path = start;
  const n = path.length;
  const open = (m: number) => !p.blocked.has(m);
  const backbite = () => {
    if (rand() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const options = neighbors(p, end).filter((m) => open(m) && m !== path[path.length - 2]);
    if (!options.length) return;
    const i = path.indexOf(pick(rand, options));
    // Join the end to tile i and reverse the part after it.
    path = path.slice(0, i + 1).concat(path.slice(i + 1).reverse());
  };
  for (let k = 0; k < 20 * n; k++) backbite();
  const done = (): boolean => {
    const a = path[0];
    const b = path[path.length - 1];
    if (type === 'loop') return neighbors(p, a).includes(b);
    if (type === 'path') return onFrame(p, a) && onFrame(p, b);
    return true;
  };
  for (let k = 0; k < 200 * n && !done(); k++) backbite();
  return done() ? path : null;
}

/** Any Hamiltonian path: a snake on an open grid, otherwise the solver's first find. */
function startingPath(p: Puzzle): number[] | null {
  if (!p.blocked.size) {
    const out: number[] = [];
    for (let r = 0; r < p.h; r++) for (let i = 0; i < p.w; i++) out.push(r * p.w + (r % 2 ? p.w - 1 - i : i));
    return out;
  }
  const open = openCells(p);
  const start = open.reduce((a, c) => (neighbors(p, c).filter((m) => !p.blocked.has(m)).length < neighbors(p, a).filter((m) => !p.blocked.has(m)).length ? c : a));
  const q = { ...p, checkpoints: [start], endpoints: [] };
  const r = solve(q, { maxSolutions: 1, nodeLimit: NODE_LIMIT });
  if (!r.solutions.length) return null;
  return walkEdges(p, r.solutions[0], start);
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
function portFor(p: Puzzle, c: number, rand: () => number) {
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
 * Turn a chosen solution into a unique puzzle: set its ends or numbers, then
 * add walls (or numbers) that rule out each other solution found.
 */
function uniqueFromSolution(p: Puzzle, order: number[], opts: GenOptions, rand: () => number): Puzzle | null {
  const pos = new Map(order.map((c, i) => [c, i]));
  const solution = new Set<number>();
  for (let i = 1; i < order.length; i++) solution.add(edgeBetween(p, order[i - 1], order[i]));
  if (opts.type === 'loop') solution.add(edgeBetween(p, order[0], order[order.length - 1]));
  if (opts.type === 'path') p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
  if (opts.type === 'checkpoints') p.checkpoints = [order[0], order[order.length - 1]];

  const addNumber = (cells: number[]) => {
    const free = cells.filter((c) => !p.checkpoints.includes(c));
    if (!free.length) return false;
    p.checkpoints = [...p.checkpoints, pick(rand, free)].sort((a, b) => pos.get(a)! - pos.get(b)!);
    return true;
  };
  const wallsAllowed = opts.clues !== 'tiles';

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
    const useNumber = opts.type === 'checkpoints' && (!wallsAllowed || rand() < 0.5);
    if (useNumber) {
      if (!addNumber(candidates.flatMap((e) => edgeCells(p, e)))) return null;
    } else if (wallsAllowed) {
      p.walls.add(pick(rand, candidates));
    } else {
      return null;
    }
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
 * Black tiles only, for loops and frame ends: there are no walls to add, so
 * keep adding black tiles while that narrows the solutions down.
 */
function uniqueByTiles(p: Puzzle, opts: GenOptions, rand: () => number): Puzzle | null {
  const CAP = 40;
  if (opts.type === 'path') {
    // Take the ends from a random path, so there is at least one solution.
    const order = randomHamiltonian(p, rand, 'path');
    if (!order) return null;
    p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
  }
  let count = solutionCount(p, CAP);
  if (count === 0) return null;
  for (let tries = 0; tries < 6 * cellCount(p) && count > 1; tries++) {
    const candidates = openCells(p);
    const add = [pick(rand, candidates)];
    if (opts.type === 'loop') {
      // Keep the colours balanced: add an opposite-coloured partner too.
      const partner = candidates.filter((c) => c !== add[0] && shadedOf(p, c) !== shadedOf(p, add[0]));
      if (!partner.length) return null;
      add.push(pick(rand, partner));
    }
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

/** Remove each clue that isn't needed for the solution to stay unique. */
function minimise(p: Puzzle, rand: () => number): void {
  type Clue = { kind: 'wall' | 'tile' | 'number'; id: number };
  const clues: Clue[] = [
    ...[...p.walls].map((id) => ({ kind: 'wall' as const, id })),
    ...[...p.blocked].map((id) => ({ kind: 'tile' as const, id })),
    ...p.checkpoints.slice(1, -1).map((id) => ({ kind: 'number' as const, id })),
  ];
  for (const clue of shuffle(rand, clues)) {
    const saved = [...p.checkpoints];
    if (clue.kind === 'wall') p.walls.delete(clue.id);
    else if (clue.kind === 'tile') p.blocked.delete(clue.id);
    else p.checkpoints = p.checkpoints.filter((c) => c !== clue.id);
    const stillUnique = (clue.kind !== 'tile' || openTilesOk(p)) && solve(p, { maxSolutions: 2, nodeLimit: NODE_LIMIT }).status === 'unique';
    if (stillUnique) continue;
    if (clue.kind === 'wall') p.walls.add(clue.id);
    else if (clue.kind === 'tile') p.blocked.add(clue.id);
    else p.checkpoints = saved;
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
