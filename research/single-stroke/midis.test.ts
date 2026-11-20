import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { hintJourney, searchMetrics } from '../../src/logic';
import { openCells, transformPuzzle, type Puzzle } from '../../src/model';
import { singleStroke } from './search';
import { outPath, record } from '../out';

// Candidates for One-Shot Midis: one-shots the easy rules draw all the way (no hint-rule step)
// with at least 30 tiles to visit, rated by Crux and Effort. Sources: the Midis search (walls and
// mixed), the easy single-stroke
// search, and the overnight black-tile filter's finds with no hard steps.
// SHARD/SHARDS split the work between processes.

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

test('midis', () => {
  const shard = Number(process.env.SHARD ?? 0);
  const shards = Number(process.env.SHARDS ?? 1);
  const files = ['one-shot/midis-walls.txt', 'one-shot/midis-mixed.txt', 'single-stroke/levels.txt', 'tiles-stroke/filter.txt', 'tiles-stroke/filter-7x7.txt', 'tiles-stroke/filter-7x8.txt', 'tiles-stroke/filter-8x8.txt'];
  const codes: string[] = [];
  for (const f of files) {
    for (const line of readFileSync(outPath(f), 'utf8').split('\n')) {
      if (line.startsWith('Tile stroke') && !line.includes('· 0 hard')) continue;
      const m = line.match(/#p=(\S+)/);
      if (m) codes.push(m[1]);
    }
  }
  const seen = new Set<string>();
  let i = 0;
  for (const code of codes) {
    const p = decodePuzzle(code);
    if (openCells(p).length < 30) continue;
    const key = canonical(p);
    if (seen.has(key)) continue;
    seen.add(key);
    if (i++ % shards !== shard) continue;
    const s = singleStroke(p);
    if (!s) continue;
    const j = hintJourney(p);
    if (j.steps.length || j.outcome !== 'solved') continue;
    const m = searchMetrics(p);
    const tiles = openCells(p).length;
    // code, w, h, tiles to visit, walls, black, decisions, crux, effort
    record(`single-stroke/midis-${shard}.tsv`, [code, p.w, p.h, tiles, p.walls.size, p.blocked.size, s.decisions, Math.round(m.tightest), Math.round(m.effort)].join('\t'));
  }
});
