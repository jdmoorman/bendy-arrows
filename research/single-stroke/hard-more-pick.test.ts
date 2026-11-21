import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { PACKS } from '../../src/levels';
import { pathKey } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Picks COUNT of hard-more.test.ts's candidates to add to One-Shot: hard for whittling down:
// no path a level already has (or another pick has), spread over sizes and hint counts by
// taking turns between each (size, hints) group, most hints and biggest boards first, the
// highest Crux of each group first. Listed easiest first (hints, then tiles to visit).
// Output: single-stroke/hard-more-pick.txt.

const COUNT = Number(process.env.COUNT ?? 50);

test('hard more pick', () => {
  const dir = outPath('single-stroke');
  const rows = readdirSync(dir)
    .filter((f) => /^hard-more-\d+\.tsv$/.test(f))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
    .map((l) => l.split('\t'))
    .map(([code, size, tiles, hints, obstacles, crux, key]) => ({ code, size, tiles: +tiles, hints: +hints, obstacles: +obstacles, crux: +crux, key }));
  const taken = new Set(
    PACKS.flatMap((k) => k.levels).map((c) => {
      const p = decodePuzzle(c);
      return pathKey(p, solve(p, { maxSolutions: 1 }).solutions[0]);
    }),
  );
  const groups = new Map<string, typeof rows>();
  for (const r of rows.sort((a, b) => b.crux - a.crux)) {
    const g = `${r.hints}|${r.tiles}|${r.size}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const order = [...groups.keys()].sort((a, b) => {
    const [ha, ta] = a.split('|').map(Number);
    const [hb, tb] = b.split('|').map(Number);
    return hb - ha || tb - ta;
  });
  const picks: typeof rows = [];
  while (picks.length < COUNT && order.some((g) => groups.get(g)!.length)) {
    for (const g of order) {
      if (picks.length >= COUNT) break;
      const list = groups.get(g)!;
      while (list.length && taken.has(list[0].key)) list.shift();
      const r = list.shift();
      if (!r) continue;
      taken.add(r.key);
      picks.push(r);
    }
  }
  picks.sort((a, b) => a.hints - b.hints || a.tiles - b.tiles);
  for (const r of picks) record('single-stroke/hard-more-pick.txt', `${r.size} · ${r.tiles} tiles · ${r.hints} hints · ${r.obstacles} obstacles · crux ${r.crux} — #p=${r.code}`);
});
