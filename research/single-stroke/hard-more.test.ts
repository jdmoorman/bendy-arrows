import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { searchMetrics, strokeJourney } from '../../src/logic';
import { openCells, orientTail, pathKey, transformPuzzle, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// More candidates for One-Shot: hard, rechecked with today's rules (Bottlenecks is easy, so a
// hard step now needs Checkerboard balance): one-shots whose stroke the easy rules can't draw
// alone, but one-shot hints finish. Sources: the hard single-stroke search, and the black-tile
// filter's finds that had hard steps (not the builder's: too squiggly). Upright, at most twice
// as tall as wide, tail low on the left. SHARD/SHARDS split the work; MIN_TILES skips small ones.
// Output: single-stroke/hard-more-<shard>.tsv: code, size, tiles, hints, obstacles, crux, path key.

/** Upright (turned if wider than tall), flagged one-shot, tail low on the left. */
function asLevel(p: Puzzle): Puzzle {
  const q = p.w > p.h ? transformPuzzle(p, 'rotateRight') : p;
  return orientTail({ ...q, oneShot: true });
}

test('hard more', () => {
  const shard = Number(process.env.SHARD ?? 0);
  const shards = Number(process.env.SHARDS ?? 1);
  const minTiles = Number(process.env.MIN_TILES ?? 20);
  const files = ['single-stroke/hard-levels.txt', 'single-stroke/hard-hinted.txt', 'tiles-stroke/filter-8x8.txt', 'tiles-stroke/filter-7x8.txt', 'tiles-stroke/filter-7x7.txt', 'tiles-stroke/filter.txt'];
  const seen = new Set<string>();
  let i = 0;
  for (const f of files) {
    for (const line of readFileSync(outPath(f), 'utf8').split('\n')) {
      const m = line.match(/#p=(\S+)/);
      if (!m || / · 0 hard/.test(line)) continue;
      let p: Puzzle;
      try {
        p = decodePuzzle(m[1]);
      } catch {
        continue;
      }
      if (p.endpoints.length !== 2 || Math.max(p.w, p.h) > 2 * Math.min(p.w, p.h) || openCells(p).length < minTiles) continue;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      if (i++ % shards !== shard) continue;
      const q = asLevel(p);
      const s = strokeJourney(q);
      if (s.outcome !== 'solved' || !s.steps.length) continue;
      const sol = solve(q, { maxSolutions: 2 });
      if (sol.status !== 'unique') continue;
      const obstacles = q.walls.size + q.blocked.size;
      record(
        `single-stroke/hard-more-${shard}.tsv`,
        [encodePuzzle(q), `${q.w}x${q.h}`, openCells(q).length, s.steps.length, obstacles, Math.round(searchMetrics(q).tightest), pathKey(q, sol.solutions[0])].join('\t'),
      );
    }
  }
});
