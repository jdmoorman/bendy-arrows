import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { AREA_SOURCES, hintJourney, RULES, type HintStep } from '../../src/logic';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// Does the chains strategy make puzzles easier? For each sample (and an extra CODE, if given):
// the difficulty rating, and the hints a player alternating easy rules and hints would need,
// without and with chains.
const NAME = 'chains/compare.txt';
const NO_CHAINS = { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') };
const show = (steps: HintStep[], outcome: string) =>
  (steps.length ? steps.map((s) => `${RULES.find((r) => r.id === s.rule)!.label}${s.area ? ` (${s.area})` : ''}`).join(' → ') : 'easy rules alone') + (outcome === 'stuck' ? ' → STUCK' : '');
test('chains compare', () => {
  writeFileSync(outPath(NAME), '');
  const cases: [string, string][] = SAMPLES.map((s) => [s.name, s.code]);
  if (process.env.CODE) cases.unshift(['YOUR PUZZLE', process.env.CODE]);
  let easier = 0;
  let hintsChanged = 0;
  for (const [name, code] of cases) {
    const p = decodePuzzle(code);
    const r0 = rateDifficulty(p, NO_CHAINS);
    const r1 = rateDifficulty(p);
    const j0 = hintJourney(p, NO_CHAINS);
    const j1 = hintJourney(p);
    const a = show(j0.steps, j0.outcome);
    const b = show(j1.steps, j1.outcome);
    if (r0 !== r1) easier++;
    if (a !== b) hintsChanged++;
    if (r0 !== r1 || a !== b || name === 'YOUR PUZZLE') {
      record(NAME, `== ${name}: ${r0}${r0 !== r1 ? ` → ${r1}` : ''}\n   without chains: ${a}\n   with chains:    ${b}`);
    }
  }
  record(NAME, `\nSUMMARY: ${easier} ratings change, ${hintsChanged} hint lists change, of ${cases.length} puzzles`);
}, 60 * 60 * 1000);
