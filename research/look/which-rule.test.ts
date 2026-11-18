import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ADVANCED_RULES, ALL_RULES, applyStep, deductions, findHint, type LogicState } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Step the easy rules one hint-sized move at a time (as the editor's Step does) and report the
// move that draws EDGE ("H10 I10" style): which rule, at which step.
const NAME = 'look/which-rule.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
test('which rule', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  const easy = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let step = 1; step < 400; step++) {
    const h = findHint(p, s, easy);
    if (h.kind !== 'deduction') { record(NAME, `the easy rules stop after ${step - 1} steps without drawing it`); return; }
    const d = h.deduction;
    // Which easy rules could draw it right now?
    const now = deductions(p, s, easy).filter((x) => x.segments.includes(edge)).map((x) => x.rule);
    if (now.length) {
      record(NAME, `step ${step}: the edge can be drawn by ${[...new Set(now)].join(', ')} (${s.segments.size} lines so far)`);
      record(NAME, `   the hint there: ${h.text}`);
      return;
    }
    s = applyStep(s, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
  }
});
