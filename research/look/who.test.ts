import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { deductions, runLogic, type LogicOptions } from '../../src/logic';
import { edgeBetween, edgeCells, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Which deductions draw an edge, from an empty board and once the other rules have run.
const NAME = 'look/who.txt';
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '     ' + Array.from({ length: p.w }, (_, c) => (on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};
test('who', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [r, c1, c2] = process.env.EDGE!.split(',').map(Number);
  const edge = edgeBetween(p, (r - 1) * p.w + c1 - 1, (r - 1) * p.w + c2 - 1);
  const name = (e: number) => edgeCells(p, e).map((c) => `${Math.floor(c / p.w) + 1},${(c % p.w) + 1}`).join('-');
  for (const opts of [{}] as LogicOptions[]) {
    const label = 'all rules';
    const ds = deductions(p, { segments: new Set(), xs: new Set() }, RATING_RULES, opts).filter((d) => d.segments.includes(edge));
    record(NAME, `== ${label}, empty board: ${ds.length} deductions draw ${name(edge)}`);
    for (const d of ds) record(NAME, `   ${d.rule}, area of ${d.cells?.length ?? '-'}; lines ${d.segments.map(name).join(' ')}\n${grid(p, d.cells ?? [])}`);
    const run = runLogic(p, RATING_RULES, undefined, opts);
    record(NAME, `   running the rating rules: edge ${run.state.segments.has(edge) ? 'drawn' : 'NOT drawn'}; ${run.solved ? 'solved' : 'stuck'}`);
    // Without Checkerboard balance: is it the balance that finds it?
    const noBal = runLogic(p, RATING_RULES.filter((x) => x !== 'balance'), undefined, opts);
    record(NAME, `   without balance: edge ${noBal.state.segments.has(edge) ? 'drawn' : 'NOT drawn'}`);
  }
});
