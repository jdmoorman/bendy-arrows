import { describe, expect, test } from 'vitest';
import { generate, isSymmetric, rateDifficulty, type ClueKind, type GenType } from '../src/generator';
import { encodePuzzle } from '../src/codec';
import { modeOf } from '../src/model';
import { solve } from '../src/solver';

describe('generate', () => {
  const types: GenType[] = ['loop', 'path', 'checkpoints'];
  const clueKinds: ClueKind[] = ['mixed', 'walls', 'tiles'];
  for (const type of types) {
    for (const clues of clueKinds) {
      test(`${type} with ${clues} clues is unique and follows the options`, () => {
        const t = performance.now();
        const r = generate({ w: type === 'loop' ? 6 : 5, h: 5, type, difficulty: 'easy', clues, minimal: true, seed: 1234 });
        const p = r.puzzle;
        console.log(type, clues, r.difficulty, r.attempts, Math.round(performance.now() - t) + 'ms', encodePuzzle(p));
        expect(solve(p).status).toBe('unique');
        expect(modeOf(p)).toBe(type === 'loop' ? 'cycle' : 'path');
        if (type === 'path') expect(p.endpoints).toHaveLength(2);
        if (type === 'checkpoints') expect(p.checkpoints.length).toBeGreaterThanOrEqual(2);
        if (clues === 'walls') expect(p.blocked.size).toBe(0);
        if (clues === 'tiles') expect(p.walls.size).toBe(0);
        expect(isSymmetric(p)).toBe(false);
        expect(rateDifficulty(p)).toBe(r.difficulty);
      }, 60000);
    }
  }

  test('the same seed gives the same puzzle', () => {
    const opts = { w: 5, h: 5, type: 'path' as const, difficulty: 'medium' as const, clues: 'mixed' as const, minimal: true, seed: 42 };
    expect(encodePuzzle(generate(opts).puzzle)).toBe(encodePuzzle(generate(opts).puzzle));
  }, 60000);
});

describe('daily puzzle', async () => {
  const { dailyOptions, dateKey } = await import('../src/daily');
  test('the options depend only on the date, and the type changes day to day', () => {
    expect(dailyOptions('2026-11-16')).toEqual(dailyOptions('2026-11-16'));
    expect(dailyOptions('2026-11-16').seed).toBe(20261116);
    const types = new Set(['2026-11-16', '2026-11-17', '2026-11-18'].map((d) => dailyOptions(d).type));
    expect(types.size).toBe(3);
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  test("today's puzzle can be made", () => {
    expect(solve(generate(dailyOptions('2026-11-16')).puzzle).status).toBe('unique');
  }, 60000);
});
