import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty, RATING_RULES } from '../../src/generator';
import { runLogic } from '../../src/logic';
import { modeOf } from '../../src/model';
import { solve } from '../../src/solver';
import { symmetryOf } from '../../src/symmetry';
import { outPath } from '../out';
import { draw } from '../balance/show.test';

// Draw a puzzle given by CODE and summarise what the solver and logic make of it.
test('look', () => {
  const p = decodePuzzle(process.env.CODE!);
  const run = runLogic(p, RATING_RULES);
  const sol = solve(p, { maxSolutions: 2 });
  writeFileSync(
    outPath('look/puzzle.txt'),
    `${modeOf(p) === 'cycle' ? 'Loop' : 'Path'} ${p.w}×${p.h}, ${p.walls.size} walls, ${p.blocked.size} black tiles, ${p.checkpoints.length} numbers\n` +
      `${draw(p)}\nsolutions: ${sol.status}; rating: ${sol.status === 'unique' ? rateDifficulty(p) : '-'}; symmetric: ${symmetryOf(p) ?? 'no'}\n` +
      `rating rules run: ${run.solved ? 'solved' : run.contradiction ? 'contradiction' : 'stuck'} after ${run.rounds} rounds, ${run.state.segments.size} lines, ${run.state.xs.size} X\n`,
  );
});
