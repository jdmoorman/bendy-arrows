import { boardParity, hintJourney, strokeJourney, type JourneyFrame, type LogicOptions, type RuleId } from './logic';
import { openTilesOk } from './generator';
import { clonePuzzle, edgeCells, edgeCount, endpointCells, isOneShot, openCells, type Puzzle } from './model';
import { solve } from './solver';

/**
 * The editor's Suggest: walls or black tiles to change so that a player alternating the chosen
 * easy rules and hints needs more hints (and still finishes). See suggestChanges.
 * (Scoring changes by how many lines the rules draw favoured tight zigzags that force the whole
 * board, which need no hints at all.)
 */

/** What to suggest: walls, or black tiles. */
export type SuggestKind = 'wall' | 'tile';

export interface Suggestion {
  kind: SuggestKind;
  /** Borders to wall, or tiles to make black. */
  at: number[];
  /** Walls (or black tiles) to take away: a swap, or on its own. */
  remove?: number[];
  /** Lines drawn by the end of the hints with the change, and before it. */
  lines: number;
  before: number;
  /** The hints a player needs with the change (and whether they get stuck), and before. */
  hints?: number;
  stuck?: boolean;
  hintsBefore?: number;
}

/**
 * The editor's Suggest, in one go (the editor splits it across workers: see suggest-client).
 * `drawn`: lines drawn in the editor, which every change leaves alone and the solution keeps.
 */
export function suggest(
  p: Puzzle,
  kind: SuggestKind,
  rules: RuleId[],
  opts: LogicOptions = {},
  onProgress?: (done: number, total: number) => void,
  drawn: number[] = [],
): Suggestion | null {
  return suggestChanges(p, kind, rules, opts, (f) => onProgress?.(Math.round(f * 1000), 1000), drawn);
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

/** How far a player gets with hints after a change (see playThrough). */
export interface TileScore {
  /** Borders walled or tiles made black, and (as -(x + 1)) walls or black tiles taken away. */
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
 * What could be added: open tiles to make black (not ends), or borders between open tiles to
 * wall; none on the `drawn` lines (no wall across one, no black tile one reaches).
 */
export function changeCandidates(p: Puzzle, kind: SuggestKind, drawn: number[] = []): number[] {
  if (kind === 'tile') {
    const onPath = new Set(drawn.flatMap((e) => edgeCells(p, e)));
    return tileCandidates(p).filter((c) => !onPath.has(c));
  }
  const lines = new Set(drawn);
  const out: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) {
    if (p.walls.has(e) || lines.has(e)) continue;
    const [a, b] = edgeCells(p, e);
    if (!p.blocked.has(a) && !p.blocked.has(b)) out.push(e);
  }
  return out;
}

/** The changes to try alone: each addition, and (walls) each wall taken away. */
export function singleChanges(p: Puzzle, kind: SuggestKind, candidates: number[]): number[][] {
  return [...candidates.map((c) => [c]), ...(kind === 'wall' ? [...p.walls].map((w) => [-w - 1]) : [])];
}

/**
 * Each set of changes (additions, and as -(x + 1) things taken away), played through (null where
 * black tiles cut the board up or leave a dead end).
 */
export function scoreChanges(p: Puzzle, kind: SuggestKind, sets: number[][], rules: RuleId[], opts: LogicOptions, onEach?: () => void): (TileScore | null)[] {
  return sets.map((at) => {
    const q = applyChange(p, kind, at);
    const s = kind === 'wall' || openTilesOk(q) ? { at, ...playThrough(q, rules, opts) } : null;
    onEach?.();
    return s;
  });
}

function applyChange(p: Puzzle, kind: SuggestKind, at: number[]): Puzzle {
  const q = clonePuzzle(p);
  const set = kind === 'wall' ? q.walls : q.blocked;
  for (const x of at) if (x >= 0) set.add(x);
  else set.delete(-x - 1);
  return q;
}

const odd = (p: Puzzle, c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
/** A pair's key, whichever comes first. */
const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** The single changes worth keeping (they let the player draw something), best first. */
export function keepSingles(scores: (TileScore | null)[]): TileScore[] {
  return scores.filter((s): s is TileScore => !!s && s.lines > 0).sort(order);
}

/**
 * An addition's partners: for a black tile, a tile of the other colour to make black or (as
 * -(x + 1)) a black tile of its own colour to clear (either keeps the colours balanced); for a
 * wall, a wall to take away (a swap).
 */
function partners(p: Puzzle, kind: SuggestKind, a: number, candidates: number[]): number[] {
  if (kind === 'wall') return [...p.walls].map((w) => -w - 1);
  return [...candidates.filter((b) => b !== a && odd(p, b) !== odd(p, a)), ...[...p.blocked].filter((r) => odd(p, r) === odd(p, a)).map((r) => -r - 1)];
}

/** Every pair to try (each once): a kept single addition and a partner (see partners). */
export function changePairs(p: Puzzle, kind: SuggestKind, singles: TileScore[], candidates: number[]): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const s of singles) {
    const [a] = s.at;
    if (a < 0) continue;
    for (const b of partners(p, kind, a, candidates)) {
      if (seen.has(pairKey(a, b))) continue;
      seen.add(pairKey(a, b));
      out.push([a, b]);
    }
  }
  return out;
}

/**
 * From the singles (best first) and every pair's score: each single on its own where it can
 * stand alone (a wall, or a wall taken away, always; a black tile when it keeps the colours
 * right), and each addition's best partner; best first, only those that improve on the puzzle as
 * it is, and the first of those with a solution. None if nothing improves on it.
 */
export function finishChanges(
  p: Puzzle,
  kind: SuggestKind,
  candidates: number[],
  singles: TileScore[],
  pairScores: Map<string, TileScore | null>,
  rules: RuleId[],
  opts: LogicOptions,
  drawn: number[] = [],
): Suggestion | null {
  const before = playThrough(p, rules, opts);
  const options: TileScore[] = [];
  for (const s of singles) {
    const [a] = s.at;
    if (kind === 'wall' || !boardParity(applyChange(p, kind, s.at))) options.push(s);
    if (a < 0) continue;
    let bestPair: TileScore | null = null;
    for (const b of partners(p, kind, a, candidates)) {
      const scored = pairScores.get(pairKey(a, b));
      const pair = scored ? { ...scored, at: [a, b] } : null;
      if (pair && (!bestPair || order(pair, bestPair) < 0)) bestPair = pair;
    }
    if (bestPair) options.push(bestPair);
  }
  options.sort(order);
  const now: TileScore = { at: [], ...before };
  for (const o of options) {
    if (order(o, now) >= 0) break;
    if (solve(applyChange(p, kind, o.at), { maxSolutions: 1, nodeLimit: 200_000, mustUse: drawn }).status === 'none') continue;
    const remove = o.at.filter((c) => c < 0).map((c) => -c - 1);
    return { kind, at: o.at.filter((c) => c >= 0), ...(remove.length ? { remove } : {}), lines: o.lines, before: before.lines, hints: o.hints, stuck: o.stuck, hintsBefore: before.hints };
  }
  return null;
}

/** Store a pair's score under its key. */
export function pairMap(pairs: number[][], scores: (TileScore | null)[]): Map<string, TileScore | null> {
  return new Map(pairs.map(([a, b], i) => [pairKey(a, b), scores[i]]));
}

/**
 * Walls or black tiles to change, scored by how far a player gets with hints afterwards:
 *  1. Every single change: each wall or black tile that could be added (black tiles not cutting
 *     the board up or leaving a dead end, whatever the colour balance, which only stops the rules
 *     once they're stuck anyway), and each wall that could go. Those that let the player draw no
 *     line at all are dropped.
 *  2. For each addition, every partner (see partners), the pair played through (each pair once):
 *     its best partner by hints, then lines.
 *  3. All of these, best first (finished before stuck, then most hints, then most lines), only
 *     those that improve on the puzzle as it is: the first that has a solution (one using every
 *     `drawn` line).
 */
function suggestChanges(p: Puzzle, kind: SuggestKind, rules: RuleId[], opts: LogicOptions, progress: (f: number) => void, drawn: number[]): Suggestion | null {
  const candidates = changeCandidates(p, kind, drawn);
  const singleSets = singleChanges(p, kind, candidates);
  let done = 0;
  const singles = keepSingles(scoreChanges(p, kind, singleSets, rules, opts, () => progress((0.1 * ++done) / singleSets.length)));
  const pairs = changePairs(p, kind, singles, candidates);
  done = 0;
  const pairScores = pairMap(pairs, scoreChanges(p, kind, pairs, rules, opts, () => progress(0.1 + (0.85 * ++done) / pairs.length)));
  const s = finishChanges(p, kind, candidates, singles, pairScores, rules, opts, drawn);
  progress(1);
  return s;
}
