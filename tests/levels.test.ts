import { describe, expect, test } from 'vitest';
import { decodePuzzle } from '../src/codec';
import { rateDifficulty } from '../src/generator';
import { LEVELS } from '../src/levels';
import { solve } from '../src/solver';
import { symmetryOf } from '../src/symmetry';

// Every official level must be a good puzzle before it ships: GitHub runs these before
// publishing, and a failure stops the deploy.
describe('official levels', () => {
  test('names and codes are all different', () => {
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.code)).size).toBe(LEVELS.length);
  });
  for (const l of LEVELS) {
    test(`${l.name}: decodes, has exactly one solution, is rated ${l.level}, and isn't symmetric`, () => {
      const p = decodePuzzle(l.code);
      expect(solve(p, { maxSolutions: 2 }).status).toBe('unique');
      expect(rateDifficulty(p)).toBe(l.level);
      expect(symmetryOf(p)).toBeNull();
    }, 60000);
  }
});
