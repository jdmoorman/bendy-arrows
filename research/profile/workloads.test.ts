import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generate } from '../../src/generator';
import { createPuzzle, edgeCount, isUsableEdge, portEnd, portId, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Representative workloads to profile (run with NODE_OPTIONS=--cpu-prof, see README in this folder).
// WORKLOAD=generate: the hard sparse search on 8×8 boards.
// WORKLOAD=exhaustive: uniqueness checks over every one-wall 6×5 path between fixed ends.
const NAME = `profile/${process.env.WORKLOAD}.txt`;

test('workload', () => {
  writeFileSync(outPath(NAME), '');
  const t0 = Date.now();
  if (process.env.WORKLOAD === 'generate') {
    let found = 0;
    for (let seed = 1; seed <= 6; seed++) {
      try {
        const r = generate({ w: 8, h: 8, difficulties: ['hard'], clues: 'mixed', minimal: true, attempts: 15, seed, maxObstacles: 12 });
        if (r.difficulty === 'hard') found++;
      } catch {
        /* no puzzle within the limit */
      }
    }
    record(NAME, `generate: ${found} hard puzzles in ${Date.now() - t0} ms`);
  } else {
    // Every pair of frame ends on a 6×5 board, and every single wall: is it unique?
    const base = createPuzzle(6, 5);
    const ports = Array.from({ length: 2 * (6 + 5) }, (_, i) => i);
    let checked = 0;
    let unique = 0;
    for (let a = 0; a < ports.length; a++) {
      for (let b = a + 1; b < ports.length; b++) {
        for (let e = 0; e < edgeCount(base); e++) {
          const p: Puzzle = createPuzzle(6, 5);
          p.endpoints = [portEnd(a), portEnd(b)];
          if (!isUsableEdge(p, e)) continue;
          p.walls.add(e);
          checked++;
          if (solve(p, { maxSolutions: 2 }).status === 'unique') unique++;
        }
      }
    }
    void portId;
    record(NAME, `exhaustive: ${checked} puzzles checked, ${unique} unique, in ${Date.now() - t0} ms`);
  }
}, 60 * 60 * 1000);
