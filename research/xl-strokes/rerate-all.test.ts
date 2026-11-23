import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { strokeJourney } from '../../src/logic';
import { openCells } from '../../src/model';
import { outPath, record } from '../out';

// The earlier big-strokes finds (big-strokes/found-*.tsv and old/), rated with today's one-shot
// hints: any hint allowed, X marks anywhere on the board (no limit near the head). Kept: the
// stroke can be finished. Output: xl-strokes/all-hints.tsv: code, size, open tiles, black tiles,
// hints, hint rules.
test('rerate big strokes, any hints', () => {
  const dir = outPath('big-strokes');
  const files = [...readdirSync(dir).filter((f) => f.startsWith('found-')).map((f) => `${dir}/${f}`), ...readdirSync(`${dir}/old`).filter((f) => f.startsWith('found-')).map((f) => `${dir}/old/${f}`)];
  const codes = new Set(files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n')).map((l) => l.split('\t')[0]).filter(Boolean));
  for (const code of codes) {
    const p = decodePuzzle(code);
    const j = strokeJourney(p);
    if (j.outcome === 'solved') record('xl-strokes/all-hints.tsv', [code, `${p.w}x${p.h}`, openCells(p).length, p.blocked.size, j.steps.length, j.steps.map((s) => s.rule + (s.area ?? '')).join(' ')].join('\t'));
  }
});
