import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES, AREA_SOURCES, applyStep, deductions, findHint, type Deduction, type LogicState } from '../../src/logic';
import { edgeBetween, edgeCells, type Puzzle } from '../../src/model';
import { columnName } from '../../src/render';
import { outPath, record } from '../out';

// Replay the editor's Step (one hint-sized move at a time, all rules) and log, at each step,
// whether a chain could draw EDGE, which move Step takes, and what happens to the chain.
const NAME = 'chains/stepping.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
const nm = (p: Puzzle, e: number) => edgeCells(p, e).map((c) => `${columnName(c % p.w)}${Math.floor(c / p.w) + 1}`).join('-');
const key = (d: Deduction) => JSON.stringify([[...d.segments].sort(), [...d.xs].sort()]);
test('stepping', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  const noChains = { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') };
  let s: LogicState = { segments: new Set(), xs: new Set() };
  let had = false;
  for (let step = 1; step < 400; step++) {
    const all = deductions(p, s, ALL_RULES);
    const without = new Set(deductions(p, s, ALL_RULES, noChains).map(key));
    const chainForEdge = all.filter((d) => d.segments.includes(edge) && !without.has(key(d)));
    if (chainForEdge.length && !had) record(NAME, `step ${step}: a chain could draw ${process.env.EDGE} now (area of ${chainForEdge[0].cells!.length} tiles)`);
    if (!chainForEdge.length && had) record(NAME, `step ${step}: the chain is gone — the previous move drew ${lastMove}`);
    had = chainForEdge.length > 0;
    const h = findHint(p, s, ALL_RULES);
    if (h.kind !== 'deduction') { record(NAME, `step ${step}: Step stops (${h.kind}); edge drawn: ${s.segments.has(edge)}`); break; }
    const d = h.deduction;
    var lastMove = `${d.rule}: ${[...d.segments.map((e) => `line ${nm(p, e)}`), ...d.xs.map((e) => `X ${nm(p, e)}`)].join(', ')}`;
    if (d.segments.includes(edge)) { record(NAME, `step ${step}: Step draws the edge (${d.rule})`); break; }
    if (had && step < 60) record(NAME, `step ${step}: Step takes ${lastMove}`);
    s = applyStep(s, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
  }
});
