import { boardParity, hintJourney, runLogic, runStroke, strokeJourney, type JourneyFrame, type LogicOptions, type RuleId } from './logic';
import { openTilesOk } from './generator';
import { clonePuzzle, edgeCells, edgeCount, endpointCells, isOneShot, openCells, type Puzzle } from './model';
import { solve } from './solver';

/**
 * The editor's Suggest.
 *  - A wall: the one after which the chosen rules (run to the end; for a one-shot, its stroke)
 *    draw the most lines (then put down the most X marks), as long as the puzzle keeps a solution.
 *  - Black tiles (usually a pair, one of each colour): see suggestTiles. Scoring tiles by lines
 *    drawn favoured tight zigzags that force the whole board, which need no hints at all.
 */

/** What to suggest: a wall, or a black tile. */
export type SuggestKind = 'wall' | 'tile';

export interface Suggestion {
  kind: SuggestKind;
  /** The border (wall) or tiles to make black (one, or a pair: one of each checkerboard colour). */
  at: number[];
  /** Black tiles to clear instead of adding a second (one of the same colour as the tile added). */
  remove?: number[];
  /** Lines the rules draw with it, and without it. */
  lines: number;
  before: number;
  /** Black tiles: the hints a player needs with them (and whether hints get stuck), and before. */
  hints?: number;
  stuck?: boolean;
  hintsBefore?: number;
}


/** How far the rules get: lines drawn, then X marks, and whether they found the puzzle has no solution. */
function reach(p: Puzzle, rules: RuleId[], opts: LogicOptions): { lines: number; xs: number; broken: boolean } {
  const run = isOneShot(p) ? runStroke(p, rules, undefined, opts) : runLogic(p, rules, undefined, opts);
  return { lines: run.state.segments.size, xs: run.state.xs.size, broken: !!run.contradiction };
}

/**
 * A black tile alone changes the board's checkerboard counts, which the ends' colours must fit,
 * so on a board that fits them one tile always breaks it: tiles are suggested in pairs (one of
 * each colour) then. Pairs are made from the PAIR_POOL best single tiles of each colour (by how
 * far the rules get before they find the problem).
 */
export function suggest(p: Puzzle, kind: SuggestKind, rules: RuleId[], opts: LogicOptions = {}, onProgress?: (done: number, total: number) => void): Suggestion | null {
  const base = reach(p, rules, opts);
  const candidates: number[] = [];
  if (kind === 'wall') {
    for (let e = 0; e < edgeCount(p); e++) {
      if (p.walls.has(e)) continue;
      const [a, b] = edgeCells(p, e);
      if (!p.blocked.has(a) && !p.blocked.has(b)) candidates.push(e);
    }
  } else {
    const ends = new Set(endpointCells(p));
    for (const c of openCells(p)) if (!ends.has(c)) candidates.push(c);
  }
  const add = (at: number[]) => {
    const q = clonePuzzle(p);
    for (const x of at) (kind === 'wall' ? q.walls : q.blocked).add(x);
    return q;
  };
  type Scored = { at: number[]; lines: number; xs: number; broken: boolean };
  const score = (at: number[]): Scored | null => {
    const q = add(at);
    // Black tiles that cut the board up or leave a dead end can't be right.
    if (kind === 'tile' && !openTilesOk(q)) return null;
    return { at, ...reach(q, rules, opts) };
  };
  const total = candidates.length;
  // Progress as a share of the work: for black tiles, this first pass is quick and the hint
  // counts below take most of the time.
  const progress = (f: number) => onProgress?.(Math.round(f * 1000), 1000);
  if (kind === 'tile') return suggestTiles(p, candidates, rules, opts, progress);
  const singles: Scored[] = [];
  candidates.forEach((x, i) => {
    const s = score([x]);
    if (s) singles.push(s);
    if (kind === 'wall') onProgress?.(i + 1, total);
    else progress((0.15 * (i + 1)) / total);
  });
  const better = (s: Scored) => !base || s.lines > base.lines || (s.lines === base.lines && s.xs > base.xs);
  const best = (list: Scored[]): Suggestion | null => {
    // Best first; the first that keeps a solution (the rules can't always tell) wins.
    for (const s of list.filter((x) => !x.broken && better(x)).sort((x, y) => y.lines - x.lines || y.xs - x.xs)) {
      if (solve(add(s.at), { maxSolutions: 1, nodeLimit: 200_000 }).status === 'none') continue;
      return { kind, at: s.at, lines: s.lines, before: base.lines };
    }
    return null;
  };
  if (kind === 'wall') {
    onProgress?.(total, total);
    return best(singles);
  }
  return suggestTiles(p, candidates, rules, opts, progress);
}

/**
 * How far a player alternating the chosen easy rules and hints (from the chosen rules) gets: the
 * hints, whether they get stuck, and the lines drawn by then.
 */
export function playThrough(p: Puzzle, rules: RuleId[], opts: LogicOptions): { hints: number; stuck: boolean; lines: number } {
  let lines = 0;
  const watch = (f: JourneyFrame) => (lines = f.segments.length);
  const j = isOneShot(p) ? strokeJourney(p, opts, watch, rules) : hintJourney(p, opts, watch, rules);
  return { hints: j.steps.length, stuck: j.outcome === 'stuck', lines };
}

/** How far a player gets with hints after some black tiles are added (see playThrough). */
export interface TileScore {
  /** Tiles to make black, and (as -(tile + 1)) black tiles to clear. */
  at: number[];
  hints: number;
  stuck: boolean;
  lines: number;
}

/** Best first: hints that finish before those that get stuck, then most hints, then most lines. */
const order = (x: TileScore, y: TileScore) => Number(x.stuck) - Number(y.stuck) || y.hints - x.hints || y.lines - x.lines;

/** The tiles that could go black: open, and not an end. */
export function tileCandidates(p: Puzzle): number[] {
  const ends = new Set(endpointCells(p));
  return openCells(p).filter((c) => !ends.has(c));
}

/**
 * Each set of changes (tiles made black, and as -(tile + 1) black tiles cleared), played through
 * (null where they cut the board up or leave a dead end).
 */
export function scoreTiles(p: Puzzle, sets: number[][], rules: RuleId[], opts: LogicOptions, onEach?: () => void): (TileScore | null)[] {
  return sets.map((at) => {
    const q = clonePuzzle(p);
    for (const c of at) if (c >= 0) q.blocked.add(c);
    else q.blocked.delete(-c - 1);
    const s = openTilesOk(q) ? { at, ...playThrough(q, rules, opts) } : null;
    onEach?.();
    return s;
  });
}

const odd = (p: Puzzle, c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
/** A pair's key, whichever tile comes first. */
const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** The single tiles worth keeping (they let the player draw something), best first. */
export function keepSingles(scores: (TileScore | null)[]): TileScore[] {
  return scores.filter((s): s is TileScore => !!s && s.lines > 0).sort(order);
}

/** A kept single's partners: a tile of the other colour to make black, or (as -(tile + 1)) a black tile of its own colour to clear. */
function partners(p: Puzzle, a: number, candidates: number[]): number[] {
  return [...candidates.filter((b) => b !== a && odd(p, b) !== odd(p, a)), ...[...p.blocked].filter((r) => odd(p, r) === odd(p, a)).map((r) => -r - 1)];
}

/** Every pair to try (each once): a kept single and a partner (see partners). */
export function tilePairs(p: Puzzle, singles: TileScore[], candidates: number[]): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const s of singles) {
    const [a] = s.at;
    for (const b of partners(p, a, candidates)) {
      if (seen.has(pairKey(a, b))) continue;
      seen.add(pairKey(a, b));
      out.push([a, b]);
    }
  }
  return out;
}

/**
 * From the singles (best first) and every pair's score (none if nothing improves on the puzzle
 * as it is): each single's best partner (a single
 * that keeps the colours right counting on its own too; a partner may instead be a black tile of
 * the same colour cleared), best first, and the first with a solution.
 */
export function finishTiles(
  p: Puzzle,
  candidates: number[],
  singles: TileScore[],
  pairScores: Map<string, TileScore | null>,
  rules: RuleId[],
  opts: LogicOptions,
): Suggestion | null {
  const before = playThrough(p, rules, opts);
  const options: TileScore[] = [];
  for (const s of singles) {
    const [a] = s.at;
    const q = clonePuzzle(p);
    q.blocked.add(a);
    if (!boardParity(q)) options.push(s);
    let bestPair: TileScore | null = null;
    for (const b of partners(p, a, candidates)) {
      const scored = pairScores.get(pairKey(a, b));
      const pair = scored ? { ...scored, at: [a, b] } : null;
      if (pair && (!bestPair || order(pair, bestPair) < 0)) bestPair = pair;
    }
    if (bestPair) options.push(bestPair);
  }
  options.sort(order);
  // Only a change that improves on the puzzle as it is (by the same ranking) is suggested.
  const now: TileScore = { at: [], ...before };
  for (const o of options) {
    if (order(o, now) >= 0) break;
    const q = clonePuzzle(p);
    for (const c of o.at) if (c >= 0) q.blocked.add(c);
    else q.blocked.delete(-c - 1);
    if (solve(q, { maxSolutions: 1, nodeLimit: 200_000 }).status === 'none') continue;
    const remove = o.at.filter((c) => c < 0).map((c) => -c - 1);
    return { kind: 'tile', at: o.at.filter((c) => c >= 0), ...(remove.length ? { remove } : {}), lines: o.lines, before: before.lines, hints: o.hints, stuck: o.stuck, hintsBefore: before.hints };
  }
  return null;
}

/** Store a pair's score under its key. */
export function pairMap(pairs: number[][], scores: (TileScore | null)[]): Map<string, TileScore | null> {
  return new Map(pairs.map(([a, b], i) => [pairKey(a, b), scores[i]]));
}

/**
 * Black tiles to add, scored by how far a player gets with hints afterwards:
 *  1. Every single tile (not an end, not cutting the board up or leaving a dead end), played
 *     through whatever the colour balance (it only stops the rules once they're stuck anyway);
 *     those that let the player draw no line at all are dropped.
 *  2. For each, every partner of the other colour, the pair played through (each pair once):
 *     each tile's best partner by hints, then lines. A single tile that keeps the colours right
 *     counts on its own too.
 *  3. All of these, best first (finished before stuck, then most hints, then most lines): the
 *     first that has a solution.
 * (The editor runs steps 1 and 2 split across several workers: see suggest-client.)
 */
function suggestTiles(p: Puzzle, _candidates: number[], rules: RuleId[], opts: LogicOptions, progress: (f: number) => void): Suggestion | null {
  const candidates = tileCandidates(p);
  let done = 0;
  const singles = keepSingles(scoreTiles(p, candidates.map((c) => [c]), rules, opts, () => progress((0.1 * ++done) / candidates.length)));
  const pairs = tilePairs(p, singles, candidates);
  done = 0;
  const pairScores = pairMap(pairs, scoreTiles(p, pairs, rules, opts, () => progress(0.1 + (0.85 * ++done) / pairs.length)));
  const s = finishTiles(p, candidates, singles, pairScores, rules, opts);
  progress(1);
  return s;
}
