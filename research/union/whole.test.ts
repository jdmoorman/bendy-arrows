import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { clonePuzzle, type Puzzle } from '../../src/model';
import { SAMPLES } from '../../tests/samples';
import { solutionUnion, solve } from '../../src/solver';
import { outPath, record } from '../out';

// Time the union of solution lines with and without seeding from the logic rules, on
// puzzles with several solutions: yours, and samples with a few obstacles taken away.
const NAME = 'union/whole.txt';
test('union with and without logic', () => {
  writeFileSync(outPath(NAME), '');
  const cases: [string, Puzzle][] = [['8×8 loop, two walls', decodePuzzle('BQEICAAAAAAAAAAAAAAAAAAAAAAABQAAAAA')]];
  for (const s of SAMPLES.filter((x) => !x.group).filter((_, i) => i % 4 === 0)) {
    const p = decodePuzzle(s.code);
    // Take away every third obstacle, keeping the puzzle solvable but not unique.
    const q = clonePuzzle(p);
    [...p.walls].forEach((w, i) => i % 3 === 0 && q.walls.delete(w));
    [...p.blocked].forEach((b, i) => i % 3 === 0 && q.blocked.delete(b));
    if (solve(q, { maxSolutions: 2, nodeLimit: 2_000_000 }).status === 'multiple') cases.push([`${s.name}, a third of its obstacles gone`, q]);
  }
  let tOff = 0;
  let tOn = 0;
  for (const [name, p] of cases) {
    let t = Date.now();
    const off = solutionUnion(p, { useLogic: false });
    const a = Date.now() - t;
    t = Date.now();
    const on = solutionUnion(p);
    const b = Date.now() - t;
    tOff += a;
    tOn += b;
    // Same answer either way, apart from borders one of them couldn't check.
    const same = off.edges.length === on.edges.length && off.edges.every((e) => on.edges.includes(e));
    record(NAME, `${name}: without logic ${a} ms (${off.edges.length} lines, ${off.unchecked.length} unchecked) | with logic ${b} ms (${on.edges.length} lines, ${on.unchecked.length} unchecked)${same ? '' : '  DIFFERENT'}`);
  }
  record(NAME, `\nTOTAL over ${cases.length} puzzles: without logic ${(tOff / 1000).toFixed(1)} s, with logic ${(tOn / 1000).toFixed(1)} s`);
}, 60 * 60 * 1000);
