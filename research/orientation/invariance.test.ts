import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { transformPuzzle, type Puzzle, type Transform } from '../../src/model';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

const NAME = `orientation/invariance-${process.env.LABEL ?? 'run'}.txt`;

/** The 8 ways to turn or mirror a board. */
function orientations(p: Puzzle): Puzzle[] {
  const turns: Transform[] = ['rotateRight', 'rotateRight', 'rotateRight'];
  const out = [p];
  for (const t of turns) out.push(transformPuzzle(out.at(-1)!, t));
  const m = transformPuzzle(p, 'flipH');
  out.push(m);
  for (const t of turns) out.push(transformPuzzle(out.at(-1)!, t));
  return out;
}

test('rate every sample in all 8 orientations', () => {
  // START skips that many samples and appends, to finish a run that was stopped.
  const skip = Number(process.env.START ?? 0);
  if (!skip) writeFileSync(outPath(NAME), '');
  let differ = 0;
  const start = Date.now();
  for (const s of SAMPLES.slice(skip)) {
    const t0 = Date.now();
    const ratings = orientations(decodePuzzle(s.code)).map(rateDifficulty);
    const same = ratings.every((r) => r === ratings[0]);
    if (!same) differ++;
    record(NAME, `${same ? 'same' : 'DIFFER'} ${s.level} ${s.name}: ${ratings.join(' ')} (${Date.now() - t0} ms)`);
  }
  record(NAME, `TOTAL ${SAMPLES.length - skip} samples, ${differ} orientation-dependent, ${Math.round((Date.now() - start) / 1000)} s`);
}, 3 * 60 * 60 * 1000);
