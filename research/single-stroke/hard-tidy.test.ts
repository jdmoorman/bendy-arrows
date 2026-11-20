import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { hintJourney } from '../../src/logic';
import { outPath } from '../out';

// Short names, and only the puzzles that need a hint on the whole board too (the Library's Hints).
test('hard single strokes: short names, hints needed', () => {
  const out: [number, number, string][] = [];
  for (const line of readFileSync(outPath('single-stroke/hard-levels.txt'), 'utf8').split('\n')) {
    const m = line.match(/(\d+)×(\d+) · (\d+) hard.*#p=(\S+)/);
    if (!m) continue;
    const j = hintJourney(decodePuzzle(m[4]));
    if (j.outcome !== 'solved' || !j.steps.length) continue;
    const [w, h] = [Number(m[1]), Number(m[2])];
    out.push([w * h, -j.steps.length, `Hard stroke ${w}×${h} · ${j.steps.length} hint${j.steps.length === 1 ? '' : 's'} — #p=${m[4]}`]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  writeFileSync(outPath('single-stroke/hard-hinted.txt'), out.map((x) => x[2]).join('\n') + '\n');
});
