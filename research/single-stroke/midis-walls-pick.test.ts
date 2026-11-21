import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { PACKS } from '../../src/levels';
import { ADVANCED_RULES, ALL_RULES, runStroke } from '../../src/logic';
import { openCells, orientTail, pathKey } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Picks One-Shot Midis: walls from midis-walls.test.ts's candidates: 40 to 56 tiles to visit,
// sparse walls (at most 0.18 per tile), no path a level already has; then 16 spread evenly
// through them by Effort (from the 10th to the 90th percentile), easiest first, at most
// three of a size. Each is turned so its tail is low on the left.
// Output: single-stroke/midis-walls-pick.txt.

const COUNT = 16;

test('midis walls pick', () => {
  const easy = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
  const dir = outPath('single-stroke');
  const rows = readdirSync(dir)
    .filter((f) => /^midis-walls-\d+\.tsv$/.test(f))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
    .map((l) => l.split('\t'))
    .map(([code, w, h, tiles, , walls, , crux, effort]) => ({ code, size: `${w}×${h}`, tiles: +tiles, walls: +walls, crux: +crux, effort: +effort }))
    .filter((r) => r.tiles >= 40 && r.tiles <= 56 && r.walls / r.tiles <= 0.18);
  const taken = new Set(PACKS.flatMap((k) => k.levels).map((c) => pathOf(c)));
  // Effort order, and a few at each step so a full size or a path already taken can be skipped.
  rows.sort((a, b) => a.effort - b.effort);
  const picks: typeof rows = [];
  const perSize = new Map<string, number>();
  for (let i = 0; i < COUNT; i++) {
    const at = Math.round(rows.length * (0.1 + (0.8 * i) / (COUNT - 1)));
    for (let j = at; j < rows.length; j++) {
      const r = rows[j];
      if ((perSize.get(r.size) ?? 0) >= 3) continue;
      const p = orientTail(decodePuzzle(r.code));
      const key = pathOf(encodePuzzle(p));
      if (taken.has(key) || !runStroke(p, easy).solved || openCells(p).length !== r.tiles) continue;
      taken.add(key);
      perSize.set(r.size, (perSize.get(r.size) ?? 0) + 1);
      picks.push({ ...r, code: encodePuzzle(p) });
      break;
    }
  }
  for (const r of picks) record('single-stroke/midis-walls-pick.txt', `${r.size} · ${r.walls} walls · crux ${r.crux} · effort ${r.effort} — #p=${r.code}`);
});

function pathOf(code: string): string {
  const p = decodePuzzle(code);
  return pathKey(p, solve(p, { maxSolutions: 1 }).solutions[0]);
}
