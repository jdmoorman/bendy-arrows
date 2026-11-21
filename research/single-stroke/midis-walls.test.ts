import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { searchMetrics } from '../../src/logic';
import { openCells, transformPuzzle, type Puzzle } from '../../src/model';
import { singleStroke } from './search';
import { outPath, record } from '../out';

// Candidates for a walls-only One-Shot Midis pack: one-shots with walls and no black tiles,
// at least 30 tiles to visit, at most twice as tall as wide, that the easy rules draw all the
// way. Each has its walls pruned (any wall it can do without, it loses) so it isn't fussier
// than it needs to be. Sources: the wall-by-wall stroke builder (stroke-gen) and the Midis
// walls search. PER_SIZE caps how many builder strokes each size contributes; SHARD/SHARDS
// split the work between processes.
// Output: single-stroke/midis-walls-<shard>.tsv: code, w, h, tiles, walls before, walls after,
// decisions, crux, effort.

/** The same puzzle turned, mirrored or with its ends swapped: one key for all of them. */
function canonical(p: Puzzle): string {
  const out: string[] = [];
  for (const q0 of [p, { ...p, endpoints: [...p.endpoints].reverse() }]) {
    let q = q0;
    for (let r = 0; r < 4; r++) {
      out.push(encodePuzzle(q), encodePuzzle(transformPuzzle(q, 'flipH')));
      q = transformPuzzle(q, 'rotateRight');
    }
  }
  return out.sort()[0];
}

/** Drop every wall the puzzle can lose and still be drawn in one easy stroke, in a fixed order. */
function prune(p: Puzzle): Puzzle {
  let q = p;
  for (const w of [...p.walls].sort((a, b) => a - b)) {
    const walls = new Set(q.walls);
    walls.delete(w);
    const r = { ...q, walls };
    if (singleStroke(r)) q = r;
  }
  return q;
}

test('midis walls', () => {
  const shard = Number(process.env.SHARD ?? 0);
  const shards = Number(process.env.SHARDS ?? 1);
  const perSize = Number(process.env.PER_SIZE ?? 1500);
  const codes: string[] = [];
  const grab = (file: string, limit = Infinity) => {
    let n = 0;
    for (const line of readFileSync(outPath(file), 'utf8').split('\n')) {
      const m = line.match(/#p=(\S+)/);
      if (m && n++ < limit) codes.push(m[1]);
    }
  };
  grab('one-shot/midis-walls.txt');
  for (const f of readdirSync(outPath('stroke-gen')).filter((x) => x.endsWith('.txt'))) grab(`stroke-gen/${f}`, perSize);
  const seen = new Set<string>();
  let i = 0;
  for (const code of codes) {
    const p = decodePuzzle(code);
    if (p.blocked.size || p.h > 2 * p.w || p.w > p.h || openCells(p).length < 30) continue;
    const key = canonical(p);
    if (seen.has(key)) continue;
    seen.add(key);
    if (i++ % shards !== shard) continue;
    if (!singleStroke(p)) continue;
    const q = prune(p);
    const s = singleStroke(q)!;
    const m = searchMetrics(q);
    record(
      `single-stroke/midis-walls-${shard}.tsv`,
      [encodePuzzle(q), q.w, q.h, openCells(q).length, p.walls.size, q.walls.size, s.decisions, Math.round(m.tightest), Math.round(m.effort)].join('\t'),
    );
  }
});
