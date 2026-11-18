import { test } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { solve } from '../../src/solver';
import { rateDifficulty } from '../../src/generator';
import { symmetryOf } from '../../src/symmetry';
import { outPath, record } from '../out';

// Check the sparsest finds of each board: unique, rated hard, not symmetric.
test('check hard sparse finds', () => {
  const dir = outPath('hard-sparse/');
  writeFileSync(outPath('hard-sparse/checked.txt'), '');
  for (const f of readdirSync(dir).filter((x) => /^path-.*\.txt$/.test(x))) {
    const finds = readFileSync(dir + f, 'utf8').split('\n').filter((l) => l.startsWith('HARD'));
    const seen = new Set<string>();
    const best = finds.map((l) => l.split(' ')).sort((a, b) => +a[1] - +b[1]).filter(([, , , , code]) => !seen.has(code) && seen.add(code)).slice(0, 4);
    for (const [, n, , seed, code] of best) {
      const p = decodePuzzle(code);
      record('hard-sparse/checked.txt', [f.replace('.txt', ''), n, `walls=${p.walls.size}`, `tiles=${p.blocked.size}`, solve(p).status, rateDifficulty(p), symmetryOf(p) ?? '-', `seed=${seed}`, code].join(' '));
    }
  }
});
