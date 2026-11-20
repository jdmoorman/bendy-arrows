import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { portCell, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Draw puzzles as text: # black, T the tail's tile, E the exit's, . open; 1-based coordinates.
const draw = (p: Puzzle) => {
  const t = portCell(p, p.endpoints[0].port);
  const e = portCell(p, p.endpoints[1].port);
  const head = '    ' + Array.from({ length: p.w }, (_, c) => String(c + 1).padStart(2)).join('');
  const rows = Array.from({ length: p.h }, (_, r) => {
    const cells = Array.from({ length: p.w }, (_, c) => {
      const i = r * p.w + c;
      return ' ' + (p.blocked.has(i) ? '#' : i === t ? 'T' : i === e ? 'E' : '.');
    });
    return String(r + 1).padStart(3) + ' ' + cells.join('');
  });
  return [head, ...rows].join('\n');
};

test('show', () => {
  const codes = (process.env.CODES ?? readFileSync(outPath('tiles-stroke/show-codes.txt'), 'utf8')).split(/\s+/).filter(Boolean);
  for (const code of codes) record('tiles-stroke/show.txt', `#p=${code}\n${draw(decodePuzzle(code))}\n`);
});
