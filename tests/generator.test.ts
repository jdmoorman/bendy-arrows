import { describe, expect, test } from 'vitest';
import { generate, isSymmetric, rateDifficulty, removableObstacles, simplifyPuzzle, type ClueKind } from '../src/generator';
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

describe('simplifyPuzzle', async () => {
  const { createPuzzle } = await import('../src/model');
  test('leaves the solution unique with no spare obstacle, and refuses puzzles without one solution', () => {
    // Not minimal: the generator leaves spare obstacles in.
    const { puzzle } = generate({ w: 6, h: 6, difficulties: [], clues: 'walls', minimal: false, seed: 11 });
    const q = simplifyPuzzle(puzzle, 3)!;
    expect(q).not.toBeNull();
    expect(solve(q, { maxSolutions: 2 }).status).toBe('unique');
    expect(q.walls.size + q.blocked.size).toBeLessThanOrEqual(puzzle.walls.size + puzzle.blocked.size);
    for (const e of q.walls) {
      const r = { ...q, walls: new Set([...q.walls].filter((x) => x !== e)) };
      expect(solve(r, { maxSolutions: 2 }).status, `wall ${e} is spare`).not.toBe('unique');
    }
    expect(simplifyPuzzle(createPuzzle(4, 4), 1)).toBeNull();
  });
});

describe('removableObstacles', async () => {
  const { solve } = await import('../src/solver');
  const { createPuzzle } = await import('../src/model');
  test('each obstacle it lists can go on its own, and each it leaves out cannot', () => {
    const { puzzle } = generate({ w: 5, h: 5, difficulties: ['easy', 'medium'], clues: 'mixed', minimal: false, attempts: 30, seed: 7 });
    const r = removableObstacles(puzzle)!;
    for (const [set, kept] of [[puzzle.walls, r.walls], [puzzle.blocked, r.blocked]] as const) {
      for (const id of set) {
        const q = { ...puzzle, walls: new Set(puzzle.walls), blocked: new Set(puzzle.blocked) };
        (set === puzzle.walls ? q.walls : q.blocked).delete(id);
        expect(solve(q, { maxSolutions: 2 }).status === 'unique', `${id}`).toBe(kept.includes(id));
      }
    }
  });
  test('a puzzle without exactly one solution has none to list', () => {
    expect(removableObstacles(createPuzzle(4, 4))).toBeNull();
  });
});
