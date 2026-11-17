import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { deductions, type Deduction } from '../../src/logic';
import { cellEdges, edgeCells, isUsableEdge, neighbors, type Puzzle } from '../../src/model';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// What are the areas only the old search finds? Count their borders out (on an empty board)
// and how many separate pieces they're made of.
const NAME = 'cuts/extra.txt';
const keyOf = (d: Deduction) => JSON.stringify([[...d.cells!].sort((a, b) => a - b), [...d.segments].sort(), [...d.xs].sort()]);
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '   ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};
test('extra areas', () => {
  writeFileSync(outPath(NAME), '');
  const tally = new Map<string, number>();
  let shown = 0;
  for (const s of SAMPLES) {
    const p = decodePuzzle(s.code);
    const empty = { segments: new Set<number>(), xs: new Set<number>() };
    const a = new Set(deductions(p, empty, ['balance'], { areaSources: ['cuts3'], threeCuts: 'labels' }).map(keyOf));
    for (const d of deductions(p, empty, ['balance'], { areaSources: ['cuts3'], threeCuts: 'search' })) {
      if (a.has(keyOf(d))) continue;
      const area = new Set(d.cells!);
      let borders = 0;
      for (const c of area) for (const e of cellEdges(p, c)) if (isUsableEdge(p, e) && !area.has(edgeCells(p, e).find((x) => x !== c)!)) borders++;
      // Pieces: connected parts of the area (through usable borders).
      let pieces = 0;
      const seen = new Set<number>();
      for (const c of area) {
        if (seen.has(c)) continue;
        pieces++;
        const q = [c];
        seen.add(c);
        while (q.length) {
          const t = q.pop()!;
          for (const m of neighbors(p, t)) if (area.has(m) && !seen.has(m)) { seen.add(m); q.push(m); }
        }
      }
      const kind = `${borders} borders, ${pieces} piece${pieces === 1 ? '' : 's'}`;
      tally.set(kind, (tally.get(kind) ?? 0) + 1);
      if (shown < 3) {
        shown++;
        record(NAME, `== ${s.name}: ${kind}\n${grid(p, [...area])}`);
      }
    }
  }
  record(NAME, `\nTALLY (empty boards): ${[...tally].map(([k, v]) => `${v}× ${k}`).join('; ')}`);
}, 30 * 60 * 1000);
