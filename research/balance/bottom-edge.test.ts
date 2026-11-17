import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { EASY_RULES } from '../../src/generator';
import { applyStep, deductions, logicStep, type LogicOptions, type LogicState } from '../../src/logic';
import { cellRC, clonePuzzle, edgeBetween, edgeCells, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';
import { draw } from './show.test';

const NAME = 'balance/bottom-edge.txt';
const A = decodePuzzle('BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA');
// The user's version: only the walls on the top and right of row 4, column 2 (1-based).
const B = clonePuzzle(A);
B.walls = new Set([edgeBetween(A, 2 * 7 + 1, 3 * 7 + 1), edgeBetween(A, 3 * 7 + 1, 3 * 7 + 2)]);
const TARGET = edgeBetween(A, 6 * 7 + 2, 6 * 7 + 3); // bottom row, columns 3–4 (1-based)

const name = (p: Puzzle, e: number) => edgeCells(p, e).map((c) => cellRC(p, c).join(',')).join('-');
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '   ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};

function easyStall(p: Puzzle): LogicState {
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i < 200; i++) {
    const st = logicStep(p, s, EASY_RULES);
    if (!st.segments.length && !st.xs.length) break;
    s = applyStep(s, st);
  }
  return s;
}

test('who finds the bottom edge', () => {
  writeFileSync(outPath(NAME), '');
  for (const [label, p] of [['A (all walls)', A], ['B (two walls)', B]] as const) {
    record(NAME, `===== ${label}\n${draw(p)}`);
    for (const [when, state] of [['empty board', { segments: new Set<number>(), xs: new Set<number>() }], ['after easy rules stall', easyStall(p)]] as const) {
      for (const opts of [{}, { stopRoomsAtTies: true }] as LogicOptions[]) {
        const ds = deductions(p, state, ['balance'], opts).filter((d) => d.segments.includes(TARGET) || d.xs.includes(TARGET));
        record(NAME, `-- ${when}, ${opts.stopRoomsAtTies ? 'stop at ties' : 'rooms every way'}: ${state.segments.size} lines, ${state.xs.size} X; ${ds.length} balance deductions draw ${name(p, TARGET)}`);
        for (const d of ds.slice(0, 3)) record(NAME, `   area of ${d.cells?.length}: lines ${d.segments.map((e) => name(p, e)).join(' ')} | X ${d.xs.map((e) => name(p, e)).join(' ')}\n   ${d.why}\n${grid(p, d.cells ?? [])}`);
      }
    }
  }
});
