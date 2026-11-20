import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
import { findLevel, levelName, MIN_PACK_LEVELS, PACKS } from '../src/levels';
import { solve } from '../src/solver';

// Every official level must be a good puzzle before it ships: GitHub runs these before
// publishing, and a failure stops the deploy.
describe('level packs', () => {
  test('each pack has a name, a description and enough levels; names and codes are all different', () => {
    for (const pack of PACKS) {
      expect(pack.name.trim(), 'name').not.toBe('');
      expect(pack.description.trim(), `${pack.name}: description`).not.toBe('');
      expect(pack.levels.length, `${pack.name}: levels`).toBeGreaterThanOrEqual(MIN_PACK_LEVELS);
    }
    expect(new Set(PACKS.map((p) => p.name)).size).toBe(PACKS.length);
    const codes = PACKS.flatMap((p) => p.levels);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('levels are found by code and named by pack and number', () => {
    const ref = findLevel(PACKS[0].levels[2])!;
    expect(ref).toEqual({ pack: 0, level: 2 });
    expect(levelName(ref)).toBe(`${PACKS[0].name} 3`);
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const pack of PACKS) {
    pack.levels.forEach((code, i) => {
      test(`${pack.name} ${i + 1}: decodes in the current format and has exactly one solution`, () => {
        const p = decodePuzzle(code);
        expect(encodePuzzle(p)).toBe(code);
        expect(solve(p, { maxSolutions: 2 }).status).toBe('unique');
      }, 60000);
    });
  }
});
