import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { solve } from '../../src/solver';
import { rateDifficulty, logicSolves, EASY_RULES } from '../../src/generator';
import { missingEnds } from '../../src/rules';
test('check', () => {
  const p = decodePuzzle('BQQIDgATABSDAQAAAAAAAAAAAAAAiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  console.log('size', p.w, p.h, 'ends', JSON.stringify(p.endpoints), 'cps', p.checkpoints, 'walls', [...p.walls], 'blocked', [...p.blocked], 'missing', missingEnds(p));
  const r = solve(p, { maxSolutions: 2 });
  console.log('solve', r.status, r.reason, r.nodes, r.solutions.length);
  const r2 = solve(p, { maxSolutions: 2, nodeLimit: 2_000_000_000 });
  console.log('solve big', r2.status, r2.nodes);
  console.log('easy logic', logicSolves(p, EASY_RULES), 'rating', rateDifficulty(p));
});
