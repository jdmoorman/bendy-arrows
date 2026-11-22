import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
import { findLevel, levelName, PACKS } from '../src/levels';
import { ADVANCED_RULES, ALL_RULES, runStroke } from '../src/logic';
import { isOneShot, openCells, pathKey } from '../src/model';
import { solve } from '../src/solver';

// Every official level must be a good puzzle before it ships: GitHub runs these before
// publishing, and a failure stops the deploy.
describe('level packs', () => {
  test('each pack has a name and at least one level; names and codes are all different', () => {
    for (const pack of PACKS) {
      expect(pack.name.trim(), 'name').not.toBe('');
      expect(pack.levels.length, `${pack.name}: levels`).toBeGreaterThan(0);
    }
    expect(new Set(PACKS.map((p) => p.name)).size).toBe(PACKS.length);
    const codes = PACKS.flatMap((p) => p.levels);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('one-shot packs hold one-shots, and the other packs none', () => {
    for (const pack of PACKS) {
      for (const code of pack.levels) expect(isOneShot(decodePuzzle(code)), `${pack.name}: ${code}`).toBe(!!pack.oneShot);
    }
  });

  test('One-Shot Midis packs: at least 30 tiles to visit, and the easy rules draw the whole stroke', () => {
    const easy = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
    const midis = PACKS.filter((k) => k.name.startsWith('One-Shot Midis'));
    expect(midis.length).toBeGreaterThan(0);
    for (const code of midis.flatMap((k) => k.levels)) {
      const p = decodePuzzle(code);
      expect(openCells(p).length, code).toBeGreaterThanOrEqual(30);
      expect(runStroke(p, easy).solved, code).toBe(true);
    }
  });


  test('no two levels have the same solution path, even turned or mirrored', () => {
    // (This covers repeats of a whole level too, turned, mirrored or with its ends swapped.)
    const seen = new Map<string, string>();
    const same: string[] = [];
    PACKS.forEach((pack) =>
      pack.levels.forEach((code, i) => {
        const name = `${pack.name} ${i + 1}`;
        const p = decodePuzzle(code);
        const key = pathKey(p, solve(p, { maxSolutions: 1 }).solutions[0]);
        const hit = seen.get(key);
        if (hit) same.push(`${name} has the same path as ${hit}`);
        else seen.set(key, name);
      }),
    );
    expect(same).toEqual([]);
  }, 120_000);

  test('levels are found by code and named by pack and number', () => {
    const ref = findLevel(PACKS[0].levels[2])!;
    expect(ref).toEqual({ pack: 0, level: 2 });
    expect(levelName(ref)).toBe(`${PACKS[0].name} 3`);
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const pack of PACKS) {
    pack.levels.forEach((code, i) => {
      test(`${pack.name} ${i + 1}: decodes in the current format, is at most twice as long as wide, and has exactly one solution`, () => {
        const p = decodePuzzle(code);
        expect(encodePuzzle(p)).toBe(code);
        // Which way up a level is, and where its tail is, are each pack's own business.
        expect(Math.max(p.w, p.h), `${p.w}×${p.h} is more than twice as long as wide`).toBeLessThanOrEqual(2 * Math.min(p.w, p.h));
        expect(solve(p, { maxSolutions: 2 }).status).toBe('unique');
      }, 60000);
    });
  }
});
