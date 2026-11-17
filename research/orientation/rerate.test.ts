import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// Rate every sample with the current logic and list the ones whose label no longer fits.
const NAME = 'orientation/rerate.txt';
test('re-rate samples', () => {
  writeFileSync(outPath(NAME), '');
  let changed = 0;
  for (const s of SAMPLES) {
    const t0 = Date.now();
    const r = rateDifficulty(decodePuzzle(s.code));
    if (r !== s.level) changed++;
    record(NAME, `${r === s.level ? 'same   ' : 'CHANGED'} ${s.level} -> ${r} | ${s.group ?? 'core'} | ${s.name} (${Date.now() - t0} ms)`);
  }
  record(NAME, `DONE: ${changed} of ${SAMPLES.length} changed`);
}, 60 * 60 * 1000);
