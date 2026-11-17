import { endTile, transformPuzzle, type Puzzle, type Transform } from './model';

/** The ways a puzzle can look the same after turning or mirroring it. */
const CHECKS: { name: string; steps: Transform[]; square?: boolean }[] = [
  { name: 'mirrored left–right', steps: ['flipH'] },
  { name: 'mirrored top–bottom', steps: ['flipV'] },
  { name: 'the same after a half turn', steps: ['rotateRight', 'rotateRight'] },
  { name: 'the same after a quarter turn', steps: ['rotateRight'], square: true },
  { name: 'mirrored along a diagonal', steps: ['rotateRight', 'flipH'], square: true },
  { name: 'mirrored along a diagonal', steps: ['rotateLeft', 'flipH'], square: true },
];

const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Whether two puzzles match, with the ends in either order and the numbers in the same or reversed order. */
function matches(a: Puzzle, b: Puzzle): boolean {
  if (a.w !== b.w || a.h !== b.h || !sameSet(a.walls, b.walls) || !sameSet(a.blocked, b.blocked)) return false;
  // Ends match by the tiles they're on: which side of the frame they enter from doesn't matter.
  const tiles = (q: Puzzle) => q.endpoints.map((e) => endTile(q, e)).sort((x, y) => x - y);
  const ta = tiles(a);
  const tb = tiles(b);
  const endsMatch = ta.length === tb.length && ta.every((t, i) => t === tb[i]);
  if (!endsMatch) return false;
  const same = (xs: number[], ys: number[]) => xs.length === ys.length && xs.every((x, i) => x === ys[i]);
  return same(a.checkpoints, b.checkpoints) || same(a.checkpoints, [...b.checkpoints].reverse());
}

/** How the puzzle is symmetric (e.g. "mirrored left–right"), or null if it isn't. */
export function symmetryOf(p: Puzzle): string | null {
  for (const c of CHECKS) {
    if (c.square && p.w !== p.h) continue;
    const q = c.steps.reduce((acc, t) => transformPuzzle(acc, t), p);
    if (matches(p, q)) return c.name;
  }
  return null;
}
