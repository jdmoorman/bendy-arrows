import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { EASY_RULES } from '../../src/generator';
import { applyStep, deductions, logicStep, type Deduction, type LogicState } from '../../src/logic';
import type { Puzzle } from '../../src/model';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// Where the easy rules stall, compare the balance hint picked by smallest area (old)
// with the one picked by fewest exits, then smallest area (new).
const NAME = 'hints/exits.txt';
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '   ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};
const by = (...keys: ((d: Deduction) => number)[]) => (a: Deduction, b: Deduction) => {
  for (const k of keys) if (k(a) !== k(b)) return k(a) - k(b);
  return a.cell - b.cell;
};
test('old vs new balance hint', () => {
  writeFileSync(outPath(NAME), '');
  let same = 0;
  let differ = 0;
  for (const s of SAMPLES) {
    const p = decodePuzzle(s.code);
    let st: LogicState = { segments: new Set(), xs: new Set() };
    for (let i = 0; i < 300; i++) {
      const step = logicStep(p, st, EASY_RULES);
      if (!step.segments.length && !step.xs.length) break;
      st = applyStep(st, step);
    }
    const ds = deductions(p, st, ['balance']);
    if (!ds.length) continue;
    const marks = (d: Deduction) => d.segments.length + d.xs.length;
    const old = [...ds].sort(by((d) => d.cells!.length, marks))[0];
    const nu = [...ds].sort(by((d) => d.exits!, (d) => d.cells!.length, marks))[0];
    if (old === nu) { same++; continue; }
    differ++;
    record(NAME, `== ${s.name}\n   old: ${old.cells!.length} tiles, ${old.exits} exits      new: ${nu.cells!.length} tiles, ${nu.exits} exits\n   old area:\n${grid(p, old.cells!)}\n   new area:\n${grid(p, nu.cells!)}`);
  }
  record(NAME, `\nSUMMARY: ${same} samples pick the same hint, ${differ} pick a different one`);
}, 30 * 60 * 1000);
