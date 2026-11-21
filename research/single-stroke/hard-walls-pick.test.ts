import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { PACKS } from '../../src/levels';
import { strokeJourney } from '../../src/logic';
import { pathKey } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Picks COUNT of the hard-walls search's finds (hard-walls<n>.test.ts) for One-Shot: hard,
// rechecked with today's rules (they still need one-shot hints, which finish them): no path a
// level already has, or another pick; half walls only and half walls with black tiles, as far
// as they go; spread over hint counts and sizes by taking turns between each (kind, hints,
// size) group, most hints and biggest first. Listed easiest first.
// Output: single-stroke/hard-walls-pick.txt.

const COUNT = Number(process.env.COUNT ?? 50);

test('hard walls pick', () => {
  const dir = outPath('single-stroke');
  const rows = readdirSync(dir)
    .filter((f) => /^hard-walls-\d+\.tsv$/.test(f))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
    .map((l) => l.split('\t'))
    .map(([code, size, tiles, , walls, black, crux]) => ({ code, size, tiles: +tiles, walls: +walls, black: +black, crux: +crux, hints: 0, key: '' }));
  const taken = new Set(
    PACKS.flatMap((k) => k.levels).map((c) => {
      const p = decodePuzzle(c);
      return pathKey(p, solve(p, { maxSolutions: 1 }).solutions[0]);
    }),
  );
  // Recheck: still hard, finished by hints, unique.
  const ok: typeof rows = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    const p = decodePuzzle(r.code);
    const j = strokeJourney(p);
    if (j.outcome !== 'solved' || !j.steps.length) continue;
    const s = solve(p, { maxSolutions: 2 });
    if (s.status !== 'unique') continue;
    ok.push({ ...r, hints: j.steps.length, key: pathKey(p, s.solutions[0]) });
  }
  const groups = new Map<string, typeof rows>();
  for (const r of ok.sort((a, b) => b.crux - a.crux)) {
    const g = `${r.black ? 'mixed' : 'walls'}|${r.hints}|${r.tiles}|${r.size}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const order = [...groups.keys()].sort((a, b) => {
    const [, ha, ta] = a.split('|');
    const [, hb, tb] = b.split('|');
    return +hb - +ha || +tb - +ta;
  });
  const picks: typeof rows = [];
  const kinds = { walls: 0, mixed: 0 };
  while (picks.length < COUNT && order.some((g) => groups.get(g)!.length)) {
    for (const g of order) {
      if (picks.length >= COUNT) break;
      const kind = g.split('|')[0] as 'walls' | 'mixed';
      // Keep the two kinds level while both have finds left.
      const other = kind === 'walls' ? 'mixed' : 'walls';
      const otherLeft = order.some((h) => h.startsWith(other) && groups.get(h)!.length);
      if (otherLeft && kinds[kind] > kinds[other]) continue;
      const list = groups.get(g)!;
      while (list.length && taken.has(list[0].key)) list.shift();
      const r = list.shift();
      if (!r) continue;
      taken.add(r.key);
      kinds[kind]++;
      picks.push(r);
    }
  }
  picks.sort((a, b) => a.hints - b.hints || a.tiles - b.tiles);
  for (const r of picks) {
    record('single-stroke/hard-walls-pick.txt', `${r.size} · ${r.tiles} tiles · ${r.hints} hints · ${r.walls} walls · ${r.black} black · crux ${r.crux} — #p=${r.code}`);
  }
});
