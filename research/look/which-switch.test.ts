import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES, AREA_SOURCES, runLogic, type LogicOptions, type RuleId } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// With every rule, which single switch (a rule, or a kind of area) being off stops EDGE
// ("H10 I10" style) from being found?
const NAME = 'look/which-switch.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
test('which switch', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  const noTrial = ALL_RULES;
  const found = (rules: RuleId[], opts: LogicOptions = {}) => runLogic(p, rules, undefined, opts).state.segments.has(edge);
  record(NAME, `all rules, every kind of area: ${found(noTrial) ? 'found' : 'MISSED'}`);
  for (const r of noTrial) {
    const rules = noTrial.filter((x) => x !== r);
    if (!found(rules)) record(NAME, `without the rule ${r}: MISSED`);
  }
  for (const src of AREA_SOURCES) {
    const opts = { areaSources: AREA_SOURCES.filter((x) => x !== src) };
    if (!found(noTrial, opts)) record(NAME, `without the area kind ${src}: MISSED`);
  }
  record(NAME, 'done');
});
