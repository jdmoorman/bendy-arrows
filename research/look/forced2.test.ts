import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { clonePuzzle, edgeBetween, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Is EDGE ("H10 I10" style) in every solution? Wall it off and look for any solution left.
const NAME = 'look/forced2.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
test('forced', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  const q = clonePuzzle(p);
  q.walls.add(edge);
  const r = solve(q, { maxSolutions: 1, nodeLimit: 50_000_000 });
  record(NAME, `with ${process.env.EDGE} walled off: ${r.status} (${r.nodes.toLocaleString()} nodes) — ${r.status === 'none' ? 'every solution uses it' : r.status === 'aborted' ? 'undecided' : 'SOME SOLUTION AVOIDS IT'}`);
});
