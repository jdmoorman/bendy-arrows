import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { AREA_SOURCES } from '../../src/logic';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// How long rating every sample takes, with and without the 3-border cuts, and whether
// any rating differs between the two.
const NAME = 'areas/timing.txt';
test('timing', () => {
  writeFileSync(outPath(NAME), '');
  let tAll = 0;
  let tNo3 = 0;
  const differ: string[] = [];
  for (const s of SAMPLES) {
    const p = decodePuzzle(s.code);
    let t = Date.now();
    const a = rateDifficulty(p);
    tAll += Date.now() - t;
    t = Date.now();
    const b = rateDifficulty(p, { areaSources: AREA_SOURCES.filter((x) => x !== 'cuts3') });
    tNo3 += Date.now() - t;
    if (a !== b) differ.push(`${s.name}: ${a} with, ${b} without`);
    if (a !== s.level) differ.push(`${s.name}: label ${s.level} but rated ${a}`);
  }
  record(NAME, `rating all ${SAMPLES.length} samples: ${(tAll / 1000).toFixed(1)} s with 3-border cuts as a last resort, ${(tNo3 / 1000).toFixed(1)} s without them`);
  record(NAME, differ.length ? differ.join('\n') : 'no other differences');
}, 30 * 60 * 1000);
