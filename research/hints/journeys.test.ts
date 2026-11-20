import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { hintJourney, RULES } from '../../src/logic';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

// The hints a player alternating easy rules and hints would need, for every core sample.
const NAME = 'hints/journeys.txt';
test('journeys', () => {
  writeFileSync(outPath(NAME), '');
  for (const s of SAMPLES.filter((x) => !x.group)) {
    const j = hintJourney(decodePuzzle(s.code));
    const steps = j.steps.map((x) => `${RULES.find((r) => r.id === x.rule)!.label}${x.area ? ` (${x.area})` : ''}`);
    record(NAME, `${s.level.padEnd(8)} ${s.name}: ${steps.length ? steps.join(' → ') : 'easy rules alone'}${j.outcome === 'stuck' ? ' → STUCK' : ''}`);
  }
});
