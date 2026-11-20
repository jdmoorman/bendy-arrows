import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { obstacleCount, rateDifficulty } from '../../src/generator';
import { hintJourney, searchMetrics } from '../../src/logic';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

/** Every puzzle on hand: the research lists in research/out, and the samples. */
function puzzles(): { source: string; code: string }[] {
  const out: { source: string; code: string }[] = [];
  const walk = (dir: string, source: string) => {
    for (const f of readdirSync(dir)) {
      const path = join(dir, f);
      if (statSync(path).isDirectory()) walk(path, `${source}/${f}`);
      else if (f.endsWith('.txt') && !f.startsWith('log')) {
        for (const line of readFileSync(path, 'utf8').split('\n')) {
          const m = line.match(/#p=(\S+)/);
          if (m) out.push({ source, code: m[1] });
        }
      }
    }
  };
  // The current chunk run first, so the earlier partial runs only add what it lacks.
  walk(outPath('chunks'), 'chunks');
  walk(outPath('chunks-first'), 'chunks');
  walk(outPath('chunks-second'), 'chunks');
  for (const line of readFileSync(outPath('hard-large/hard-levels-v06.txt'), 'utf8').split('\n')) {
    const m = line.match(/#p=(\S+)/);
    if (m) out.push({ source: 'hard-large', code: m[1] });
  }
  for (const s of SAMPLES) out.push({ source: 'samples', code: s.code });
  const seen = new Set<string>();
  return out.filter((x) => {
    const c = encodePuzzle(decodePuzzle(x.code));
    if (seen.has(c)) return false;
    seen.add(c);
    x.code = c;
    return true;
  });
}

/** Crux and Effort for every `of`-th puzzle starting at `shard`, one TSV line each. */
export function collect(shard: number, of: number): void {
  const name = `metrics/part-${shard}.tsv`;
  puzzles().forEach((x, i) => {
    if (i % of !== shard) return;
    const p = decodePuzzle(x.code);
    const m = searchMetrics(p);
    const j = hintJourney(p);
    const size = `${p.w}×${p.h}`;
    record(name, [x.source, size, rateDifficulty(p), j.steps.length + (j.outcome === 'stuck' ? '+' : ''), obstacleCount(p), Math.round(m.tightest), Math.round(m.effort), x.code].join('\t'));
  });
}
