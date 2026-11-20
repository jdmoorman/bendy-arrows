import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { hintJourney, searchMetrics } from '../../src/logic';
import { singleStroke } from '../single-stroke/search';
import { outPath, record } from '../out';

// Rate the black-tile strokes found overnight, one line each (tab-separated), written as it goes.
// SHARD/SHARDS split the work between processes. Sources: every filter find of 7×7 and up, the
// filter's 6×6 finds (at most PER_HARD per number of hard steps), and builder finds of 9×9 and up
// (the filter has none that big).
const PER_HARD = 60;

function sources(): { code: string; source: string }[] {
  const dir = outPath('tiles-stroke');
  const out: { code: string; source: string }[] = [];
  const perHard: Record<string, number> = {};
  for (const f of readdirSync(dir).sort()) {
    const filter = f.startsWith('filter');
    const builder = f.startsWith('build-') && /\d+x\d+/.test(f);
    if (!filter && !builder) continue;
    for (const line of readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      const m = line.match(/Tile stroke (\d+)×(\d+) · (\d+) hard — #p=(\S+)/);
      if (!m) continue;
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (builder && w < 9) continue;
      if (filter && w * h < 36) continue;
      if (filter && w === 6 && h === 6) {
        perHard[m[3]] = (perHard[m[3]] ?? 0) + 1;
        if (perHard[m[3]] > PER_HARD) continue;
      }
      out.push({ code: m[4], source: filter ? 'filter' : 'builder' });
    }
  }
  const seen = new Set<string>();
  return out.filter((x) => !seen.has(x.code) && seen.add(x.code));
}

test('rate', () => {
  const shard = Number(process.env.SHARD ?? 0);
  const shards = Number(process.env.SHARDS ?? 1);
  const name = `tiles-stroke/rated-${shard}.tsv`;
  const done = existsSync(outPath(name)) ? new Set(readFileSync(outPath(name), 'utf8').split('\n').map((l) => l.split('\t')[0])) : new Set();
  sources().forEach(({ code, source }, i) => {
    if (i % shards !== shard || done.has(code)) return;
    const p = decodePuzzle(code);
    if (p.walls.size) return;
    const s = singleStroke(p, true);
    if (!s) return;
    const j = hintJourney(p);
    const m = searchMetrics(p);
    const rules = Object.entries(s.rules).map(([r, n]) => `${r}:${n}`).join(',');
    // code, source, w, h, black tiles, hard steps, hints, crux, effort, rules at decisions
    record(name, [code, source, p.w, p.h, p.blocked.size, s.hard, j.steps.length + (j.outcome === 'stuck' ? '+' : ''), Math.round(m.tightest), Math.round(m.effort), rules].join('\t'));
  });
});
