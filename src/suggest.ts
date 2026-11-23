import { runLogic, runStroke, type LogicOptions, type RuleId } from './logic';
import { openTilesOk } from './generator';
import { clonePuzzle, edgeCells, edgeCount, endpointCells, isOneShot, openCells, type Puzzle } from './model';
import { solve } from './solver';

/**
 * The editor's Suggest: the wall (or black tile) to add that lets the logic go furthest. Each
 * border between two open tiles without a wall (or each open tile but the ends') gets one in
 * turn; the chosen rules then run to the end (for a one-shot, its stroke), and the one after
 * which they draw the most lines (then put down the most X marks) wins, as long as the puzzle
 * keeps a solution.
 */

/** What to suggest: a wall, or a black tile. */
export type SuggestKind = 'wall' | 'tile';

export interface Suggestion {
  kind: SuggestKind;
  /** The border (wall) or tiles (one black tile, or a pair: one of each checkerboard colour). */
  at: number[];
  /** Lines the rules draw with it, and without it. */
  lines: number;
  before: number;
}

/** How many of the best single tiles of each colour are tried together as pairs. */
const PAIR_POOL = 12;

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
  const total = kind === 'tile' ? 2 * candidates.length : candidates.length;
  const singles: Scored[] = [];
  candidates.forEach((x, i) => {
    const s = score([x]);
    if (s) singles.push(s);
    onProgress?.(i + 1, total);
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
  const one = best(singles);
  if (one || kind === 'wall') {
    onProgress?.(total, total);
    return one;
  }
  // Pairs, one of each colour, from the best singles.
  const odd = (c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
  const top = (o: boolean) => singles.filter((s) => odd(s.at[0]) === o).sort((x, y) => y.lines - x.lines || y.xs - x.xs).slice(0, PAIR_POOL).map((s) => s.at[0]);
  const [shaded, white] = [top(true), top(false)];
  const pairs: Scored[] = [];
  let done = 0;
  for (const a of shaded) {
    for (const b of white) {
      const s = score([a, b]);
      if (s) pairs.push(s);
      onProgress?.(candidates.length + Math.round((++done / (shaded.length * white.length)) * candidates.length), total);
    }
  }
  onProgress?.(total, total);
  return best(pairs);
}
