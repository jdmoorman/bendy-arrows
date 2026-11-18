import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ADVANCED_RULES, ALL_RULES, AREA_SOURCES, applyStep, deductions, findHint, runLogic, type Deduction, type LogicState } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Replay "easy rules, then a hint" and, at every stall, list the balance deductions only chains
// finds, whether any draws EDGE, and which hint is taken instead.
const NAME = 'chains/when.txt';
const NO_CHAINS = { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') };
const cell = (p: Puzzle, s: string) => { const [r, c] = s.split(',').map(Number); return (r - 1) * p.w + c - 1; };
const key = (d: Deduction) => JSON.stringify([[...d.segments].sort(), [...d.xs].sort()]);
const grid = (p: Puzzle, cells: number[]) => {
  const on = new Set(cells);
  return Array.from({ length: p.h }, (_, r) => '     ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : on.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
};
test('when', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((s) => cell(p, s));
  const edge = edgeBetween(p, a, b);
  const easy = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let step = 1; step < 40; step++) {
    const run = runLogic(p, easy, s);
    if (!s.segments.has(edge) && run.state.segments.has(edge)) record(NAME, `the easy rules draw the edge before hint ${step}`);
    s = run.state;
    if (run.solved) { record(NAME, 'solved'); break; }
    const without = new Set(deductions(p, s, ['balance'], NO_CHAINS).map(key));
    const onlyChains = deductions(p, s, ['balance']).filter((d) => !without.has(key(d)));
    const drawsEdge = onlyChains.filter((d) => d.segments.includes(edge));
    const h = findHint(p, s);
    if (h.kind !== 'deduction') { record(NAME, `hint ${step}: none (${h.kind})`); break; }
    const d = h.deduction;
    record(NAME, `hint ${step}: ${d.rule}${d.cells ? ` (${d.cells.length} tiles, ${d.exits ?? '?'} exits)` : ''}${d.segments.includes(edge) ? ' — DRAWS THE EDGE' : ''}; only-chains deductions here: ${onlyChains.length}${drawsEdge.length ? `, ${drawsEdge.length} of them draw the edge` : ''}`);
    for (const x of drawsEdge.slice(0, 1)) record(NAME, `   chains area for the edge: ${x.cells!.length} tiles, ${x.exits} exits\n${grid(p, x.cells!)}`);
    if (d.segments.includes(edge)) record(NAME, `   the hint's area:\n${grid(p, d.cells ?? [])}`);
    s = applyStep(s, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
    if (s.segments.has(edge)) break;
  }
});
