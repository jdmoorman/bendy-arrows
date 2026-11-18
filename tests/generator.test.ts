import { describe, expect, test } from 'vitest';
import { generate, isSymmetric, rateDifficulty, type ClueKind } from '../src/generator';
import { encodePuzzle } from '../src/codec';
import { solve } from '../src/solver';

describe('generate', () => {
  const clueKinds: ClueKind[] = ['mixed', 'walls', 'tiles'];
  for (const clues of clueKinds) {
    test(`${clues} clues: unique and follows the options`, () => {
      const t = performance.now();
      const r = generate({ w: 5, h: 5, difficulties: ['easy'], clues, minimal: true, seed: 1234 });
      const p = r.puzzle;
      console.log(clues, r.difficulty, r.attempts, Math.round(performance.now() - t) + 'ms', encodePuzzle(p));
      expect(solve(p).status).toBe('unique');
      expect(p.endpoints).toHaveLength(2);
      if (clues === 'walls') expect(p.blocked.size).toBe(0);
      if (clues === 'tiles') expect(p.walls.size).toBe(0);
      expect(isSymmetric(p)).toBe(false);
      expect(rateDifficulty(p)).toBe(r.difficulty);
    }, 60000);
  }

  test('the same seed gives the same puzzle', () => {
    const opts = { w: 5, h: 5, difficulties: ['medium' as const], clues: 'mixed' as const, minimal: true, seed: 42 };
    expect(encodePuzzle(generate(opts).puzzle)).toBe(encodePuzzle(generate(opts).puzzle));
  }, 60000);
});

describe('obstacle limit', async () => {
  const { obstacleCount } = await import('../src/generator');
  test('puzzles stay within the limit and unique', () => {
    const r = generate({ w: 6, h: 6, difficulties: [], clues: 'mixed', minimal: true, maxObstacles: 4, seed: 5 });
    expect(obstacleCount(r.puzzle)).toBeLessThanOrEqual(4);
    expect(solve(r.puzzle).status).toBe('unique');
  }, 120000);
});

describe('several difficulties', () => {
  test('stops at a puzzle rated one of the chosen difficulties', () => {
    const r = generate({ w: 5, h: 5, difficulties: ['medium', 'hard'], clues: 'mixed', minimal: true, seed: 7 });
    expect(['medium', 'hard']).toContain(r.difficulty);
  }, 60000);
});
