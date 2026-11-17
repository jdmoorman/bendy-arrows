import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { edgeCount, isUsableEdge } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// How fast do randomly tie-broken solves cover the borders some solution uses?
const NAME = 'union/sampling.txt';
test('sampling coverage', () => {
  writeFileSync(outPath(NAME), '');
  for (const code of (process.env.CODES ?? 'BQEICAAAAAAAAAAAAAAAAAAAAAAABQAAAAA').split(',')) {
    const p = decodePuzzle(code);
    const usable = Array.from({ length: edgeCount(p) }, (_, e) => e).filter((e) => isUsableEdge(p, e)).length;
    const used = new Set<number>();
    const t = Date.now();
    let nodes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = solve(p, { maxSolutions: 1, seed, nodeLimit: 200_000 });
      nodes += r.nodes;
      for (const x of r.solutions[0] ?? []) used.add(x);
      if ([1, 5, 10, 20, 40, 60].includes(seed)) record(NAME, `${code.slice(0, 12)}… after ${seed} samples: ${used.size} of ${usable} usable borders covered, ${nodes.toLocaleString()} nodes, ${Date.now() - t} ms`);
    }
  }
});
