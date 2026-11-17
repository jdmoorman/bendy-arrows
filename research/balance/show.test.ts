import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { cellRC, edgeCells, endTile, type Puzzle } from '../../src/model';
import { SAMPLES } from '../../src/samples';
import { outPath } from '../out';

/** Draw a puzzle as text: walls as | and ---, black tiles as #, ends as E. */
export function draw(p: Puzzle): string {
  const ends = new Set(p.endpoints.map((e) => endTile(p, e)));
  const lines: string[] = [];
  lines.push('    ' + Array.from({ length: p.w }, (_, c) => ` ${c}  `).join(''));
  for (let r = 0; r < p.h; r++) {
    let row = ` ${r}  `;
    let below = '    ';
    for (let c = 0; c < p.w; c++) {
      const i = r * p.w + c;
      row += p.blocked.has(i) ? ' # ' : ends.has(i) ? ' E ' : ' . ';
      if (c < p.w - 1) row += p.walls.has(r * (p.w - 1) + c) ? '|' : ' ';
      if (r < p.h - 1) below += p.walls.has(p.h * (p.w - 1) + r * p.w + c) ? '--- ' : '    ';
    }
    lines.push(row, below);
  }
  return lines.join('\n');
}

test('show', () => {
  const s = SAMPLES.find((x) => x.name === 'Path 7×7 · walls')!;
  const p = decodePuzzle(s.code);
  const walls = [...p.walls].map((e) => edgeCells(p, e).map((c) => cellRC(p, c).join(',')).join('-'));
  writeFileSync(outPath('balance/show.txt'), `${s.code}\n${draw(p)}\nwalls: ${walls.join('  ')}\nends: ${p.endpoints.map((e) => cellRC(p, endTile(p, e)).join(',')).join('  ')}\n`);
});
