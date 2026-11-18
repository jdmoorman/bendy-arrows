import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { AREA_SOURCES, deductions, runLogic, type LogicOptions } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Does an edge get found with and without chains? CODE = puzzle, EDGE = "row,col row,col" (from 1).
const NAME = 'look/chain-case.txt';
const cell = (p: Puzzle, s: string) => { const [r, c] = s.split(',').map(Number); return (r - 1) * p.w + c - 1; };
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '     ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};
test('chain case', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((s) => cell(p, s));
  const edge = edgeBetween(p, a, b);
  const sol = solve(p, { maxSolutions: 2 });
  record(NAME, `solutions: ${sol.status}; edge in the solution: ${sol.solutions[0]?.includes(edge)}`);
  for (const [label, opts] of [['without chains', { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') }], ['with chains', {}]] as [string, LogicOptions][]) {
    const run = runLogic(p, RATING_RULES, undefined, opts);
    record(NAME, `${label}: rating rules ${run.solved ? 'solve it' : 'get stuck'} (${run.state.segments.size} lines); edge drawn: ${run.state.segments.has(edge)}`);
  }
  // Where the rules without chains stall: which deduction (with chains) draws the edge, and its area?
  const stall = runLogic(p, RATING_RULES, undefined, { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') }).state;
  const ds = deductions(p, stall, ['balance']).filter((d) => d.segments.includes(edge));
  record(NAME, `at that stall, balance deductions drawing the edge (with chains): ${ds.length}`);
  for (const d of ds.slice(0, 2)) record(NAME, `  area of ${d.cells!.length} tiles:\n${grid(p, d.cells!)}`);
});
