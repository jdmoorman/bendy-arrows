import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/codec';
import { findLevel, levelName, MIN_PACK_LEVELS, PACKS } from '../src/levels';
import { isOneShot, transformPuzzle, type Puzzle } from '../src/model';
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

  test('the One-Shot packs hold one-shots, and the other packs none', () => {
    for (const pack of PACKS) {
      for (const code of pack.levels) expect(isOneShot(decodePuzzle(code)), `${pack.name}: ${code}`).toBe(pack.name.startsWith('One-Shot'));
    }
  });

  test('no level is another turned, mirrored or with its ends swapped', () => {
    // Every way a board can face (4 turns, each mirrored or not), with the ends either way round.
    const variants = (p: Puzzle): string[] => {
      const out: string[] = [];
      for (const q0 of [p, { ...p, endpoints: [...p.endpoints].reverse() }]) {
        let q = q0;
        for (let r = 0; r < 4; r++) {
          out.push(encodePuzzle(q), encodePuzzle(transformPuzzle(q, 'flipH')));
          q = transformPuzzle(q, 'rotateRight');
        }
      }
      return out;
    };
    const seen = new Map<string, string>();
    const same: string[] = [];
    PACKS.forEach((pack) =>
      pack.levels.forEach((code, i) => {
        const name = `${pack.name} ${i + 1}`;
        const vs = variants(decodePuzzle(code));
        const hit = vs.map((v) => seen.get(v)).find((n) => n);
        if (hit) same.push(`${name} is ${hit}`);
        for (const v of vs) seen.set(v, name);
      }),
    );
    expect(same).toEqual([]);
  });

  test('levels are found by code and named by pack and number', () => {
    const ref = findLevel(PACKS[0].levels[2])!;
    expect(ref).toEqual({ pack: 0, level: 2 });
    expect(levelName(ref)).toBe(`${PACKS[0].name} 3`);
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const pack of PACKS) {
    pack.levels.forEach((code, i) => {
      test(`${pack.name} ${i + 1}: decodes in the current format, is tall rather than wide, and has exactly one solution`, () => {
        const p = decodePuzzle(code);
        expect(encodePuzzle(p)).toBe(code);
        // Phones are held upright: a level is at least as tall as it is wide.
        expect(p.h, `${p.w}×${p.h} is wider than tall`).toBeGreaterThanOrEqual(p.w);
        expect(solve(p, { maxSolutions: 2 }).status).toBe('unique');
      }, 60000);
    });
  }
});
