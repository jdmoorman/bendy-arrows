import { encodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { createPuzzle, edgeCount, portCell, portCount, portEnd, transformPuzzle, type Puzzle, type Transform } from '../../src/model';
import { solve } from '../../src/solver';
import { record } from '../out';

// Paths with two frame ends and exactly one obstacle (a wall or a black tile): which have a
// unique solution? Every board from 2×2 to 8×8, one way round (w ≥ h). An end counts by its
// tile (a corner's two borders are the same placement), entrance and exit are interchangeable,
// and puzzles that are flips or rotations of each other count once.
export const SIZES: [number, number][] = [];
for (let h = 2; h <= 8; h++) for (let w = h; w <= 8; w++) SIZES.push([w, h]);

const NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' };

function symmetries(w: number, h: number): Transform[][] {
  const keep: Transform[][] = [[], ['flipH'], ['flipV'], ['flipH', 'flipV']];
  return w === h ? [...keep, ['rotateRight'], ['rotateLeft'], ['rotateRight', 'flipH'], ['rotateLeft', 'flipH']] : keep;
}

const keyOf = (p: Puzzle) =>
  `${p.endpoints.map((e) => portCell(p, e.port)).sort((x, y) => x - y).join(',')}|${[...p.blocked].join(',')}|${[...p.walls].join(',')}`;

function canonical(p: Puzzle): string {
  return symmetries(p.w, p.h)
    .map((ts) => keyOf(ts.reduce((q, t) => transformPuzzle(q, t), p)))
    .sort()[0];
}

/** Search the boards whose index in SIZES is `shard` modulo `of`, writing each unique puzzle as it's found. */
export function searchOneObstacle(shard: number, of: number): void {
  SIZES.forEach(([w, h], i) => {
    if (i % of !== shard) return;
    const t0 = Date.now();
    const seen = new Set<string>();
    let unique = 0;
    const blank = createPuzzle(w, h);
    const n = portCount(blank);
    const obstacles: { wall: boolean; id: number }[] = [
      ...Array.from({ length: w * h }, (_, id) => ({ wall: false, id })),
      ...Array.from({ length: edgeCount(blank) }, (_, id) => ({ wall: true, id })),
    ];
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const ca = portCell(blank, a);
        const cb = portCell(blank, b);
        if (ca === cb) continue;
        for (const o of obstacles) {
          if (!o.wall && (o.id === ca || o.id === cb)) continue;
          const p = createPuzzle(w, h);
          p.endpoints = [portEnd(a), portEnd(b)];
          (o.wall ? p.walls : p.blocked).add(o.id);
          const key = canonical(p);
          if (seen.has(key)) continue;
          seen.add(key);
          if (solve(p, { maxSolutions: 2 }).status !== 'unique') continue;
          unique++;
          const d = rateDifficulty(p);
          const j = hintJourney(p);
          const hints = `${String(j.steps.length).padStart(2, '0')}${j.outcome === 'stuck' ? '+' : ''} hints`;
          record(`one-obstacle/${w}x${h}.txt`, `One obstacle ${w}×${h} · ${NAMES[d]} · ${hints} · ${o.wall ? 'wall' : 'black tile'} — #p=${encodePuzzle(p)}`);
        }
      }
    }
    record('one-obstacle/log.txt', `${w}×${h}: ${seen.size} puzzles up to symmetry, ${unique} unique (${Date.now() - t0} ms)`);
  });
}
