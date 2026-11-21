import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES, AREA_SOURCES, applyStep, deductions, findHint, type AreaSource, type Deduction, type LogicState } from '../../src/logic';
import { edgeCells, type Puzzle } from '../../src/model';
import { columnName } from '../../src/render';
import { outPath, record } from '../out';

// Replay Step; for each balance move, which single kind of area finds that same move, and what
// area did Step use (fewest exits, then smallest)?
const NAME = 'chains/sources.txt';
const nm = (p: Puzzle, e: number) => edgeCells(p, e).map((c) => `${columnName(c % p.w)}${Math.floor(c / p.w) + 1}`).join('-');
const marks = (d: Deduction) => JSON.stringify([[...d.segments].sort(), [...d.xs].sort()]);
const box = (p: Puzzle, cells: number[]) => {
  const rs = cells.map((c) => Math.floor(c / p.w));
  const cs = cells.map((c) => c % p.w);
  const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
  const rect = (r1 - r0 + 1) * (c1 - c0 + 1) === cells.length;
  return `${cells.length} tiles ${rect ? `= rectangle ${columnName(c0)}${r0 + 1}:${columnName(c1)}${r1 + 1}` : `(not a rectangle; spans ${columnName(c0)}${r0 + 1}:${columnName(c1)}${r1 + 1})`}`;
};
test('sources', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let step = 1; step <= Number(process.env.STEPS ?? 20); step++) {
    const h = findHint(p, s, ALL_RULES);
    if (h.kind !== 'deduction') break;
    const d = h.deduction;
    if (d.rule === 'balance') {
      const who = AREA_SOURCES.filter((src: AreaSource) => deductions(p, s, ['balance'], { areaSources: [src] }).some((x) => marks(x) === marks(d)));
      record(NAME, `step ${step}: line ${d.segments.map((e) => nm(p, e)).join(', ')} — Step's area: ${box(p, d.cells!)}, ${d.exitTiles} tiles with exits — found by: ${who.join(', ') || 'none alone'}`);
    } else record(NAME, `step ${step}: ${d.rule}`);
    s = applyStep(s, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
  }
});
