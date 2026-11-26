import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { codeDifficulty, decodePuzzle, encodePuzzle } from '../src/codec';
import { countHints, difficultyLevel } from '../src/difficulty';
import { ALL_PACKS } from '../src/levels';

// `npm run rate-levels`: rewrite each level's code in src/levels.ts to carry the difficulty
// worked out with today's rules (after the rules or the difficulty bands change, say).
test('rate levels', () => {
  const file = fileURLToPath(new URL('../src/levels.ts', import.meta.url));
  let text = readFileSync(file, 'utf8');
  let changed = 0;
  for (const code of new Set(ALL_PACKS.flatMap((k) => k.levels))) {
    const p = decodePuzzle(code);
    const d = difficultyLevel(countHints(p));
    if (codeDifficulty(code) === d && encodePuzzle(p, d) === code) continue;
    text = text.replaceAll(`'${code}'`, `'${encodePuzzle(p, d)}'`);
    changed++;
  }
  writeFileSync(file, text);
  console.log(`${changed} level code${changed === 1 ? '' : 's'} rewritten.`);
});
