import { expect, test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { PACKS } from '../../src/levels';
import { hintJourney } from '../../src/logic';

// After splitting off Checkerboard imbalance: which pack levels do the hints no longer finish?
test('pack levels the hints still finish', () => {
  const stuck: string[] = [];
  for (const pack of PACKS) {
    pack.levels.forEach((code, i) => {
      const j = hintJourney(decodePuzzle(code));
      if (j.outcome !== 'solved') stuck.push(`${pack.name} ${i + 1} (${code}): stuck after ${j.steps.length} hints`);
    });
  }
  expect(stuck).toEqual([]);
}, 600000);
