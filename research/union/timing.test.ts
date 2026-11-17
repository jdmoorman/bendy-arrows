import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { edgeCells, edgeCount, isUsableEdge } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// How long does each per-border search take on a puzzle with many solutions?
const NAME = 'union/timing.txt';
test('per-border searches', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE ?? 'BQEICAAAAAAAAAAAAAAAAAAAAAAABQAAAAA');
  const first = solve(p, { maxSolutions: 2 });
  const used = new Set(first.solutions.flat());
  let n = 0;
  for (let e = 0; e < edgeCount(p) && n < 12; e++) {
    if (used.has(e) || !isUsableEdge(p, e)) continue;
    n++;
    const t = Date.now();
    const r = solve(p, { maxSolutions: 1, mustUse: [e], nodeLimit: 2_000_000 });
    const rc = edgeCells(p, e).map((c) => `${Math.floor(c / p.w) + 1},${(c % p.w) + 1}`).join('-');
    record(NAME, `border ${rc}: ${r.status}, ${r.nodes.toLocaleString()} nodes, ${Date.now() - t} ms`);
    if (r.solutions.length) for (const x of r.solutions[0]) used.add(x);
  }
});
