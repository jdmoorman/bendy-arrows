import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { hintJourney, searchMetrics, strokeJourney } from '../../src/logic';
import { outPath, record } from '../out';

// After Checkerboard balance lost its unequal-area case: which hard one-shots do one-shot hints
// still finish? One line each: code, size, stroke hints, whole-board hints, crux.
test('hard recheck', () => {
  const seen = new Set<string>();
  for (const line of readFileSync(outPath('single-stroke/hard-levels.txt'), 'utf8').split('\n')) {
    const m = line.match(/#p=(\S+)/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const p = decodePuzzle(m[1]);
    const s = strokeJourney(p);
    if (s.outcome !== 'solved' || !s.steps.length) continue;
    const j = hintJourney(p);
    record('single-stroke/hard-recheck.tsv', [m[1], `${p.w}x${p.h}`, s.steps.length, j.outcome === 'solved' ? j.steps.length : `${j.steps.length}+`, Math.round(searchMetrics(p).tightest)].join('\t'));
  }
}, 3_600_000);
