import { describe, expect, test } from 'vitest';
import { decodePuzzle } from '../src/codec';
import { RATING_RULES } from '../src/generator';
import { runLogic } from '../src/logic';
import { edgeBetween, type Puzzle } from '../src/model';
import { solve } from '../src/solver';
import { DONE, WISHES, type Wish } from './logic-wishlist';

const cell = (p: Puzzle, rc: string) => {
  const [r, c] = rc.split(',').map(Number);
  return (r - 1) * p.w + (c - 1);
};

function check(w: Wish) {
  const p = decodePuzzle(w.code);
  const edge = edgeBetween(p, cell(p, w.edge[0]), cell(p, w.edge[1]));
  return { p, edge };
}

describe('logic wishlist', () => {
  if (!WISHES.length && !DONE.length) test.skip('no wishes recorded yet', () => {});
  for (const w of WISHES) {
    test(`${w.name}: the edge is in the puzzle's only solution`, () => {
      const { p, edge } = check(w);
      const r = solve(p, { maxSolutions: 2 });
      expect(r.status).toBe('unique');
      expect(r.solutions[0]).toContain(edge);
    });
    // Expected to fail until the rules learn this one. When it starts passing, vitest reports
    // it as a failure: move the entry to DONE in logic-wishlist.ts.
    test.fails(`${w.name}: the rules find the edge (not yet)`, () => {
      const { p, edge } = check(w);
      expect(runLogic(p, RATING_RULES).state.segments.has(edge)).toBe(true);
    });
  }
  for (const w of DONE) {
    test(`${w.name}: the rules find the edge`, () => {
      const { p, edge } = check(w);
      expect(runLogic(p, RATING_RULES).state.segments.has(edge)).toBe(true);
    });
  }
});
