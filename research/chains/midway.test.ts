import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES, applyStep, findHint, type LogicState } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// A player who worked the first K moves out themselves (so hints have no memory), then presses
// Hint until EDGE is drawn: does a hint reach it, and with which rule?
const NAME = 'chains/midway.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
test('midway', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  // The player's moves: the same ones Step would make (no memory needed to pick them).
  const moves: LogicState[] = [];
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i < 18; i++) {
    const h = findHint(p, s, ALL_RULES);
    if (h.kind !== 'deduction') break;
    s = applyStep(s, { segments: h.deduction.segments, xs: h.deduction.xs, byRule: {}, solved: false });
    moves.push(s);
  }
  for (const k of [8, 12, 15, 18]) {
    let st = moves[k - 1];
    let result = 'never';
    for (let step = 1; step < 40; step++) {
      const h = findHint(p, st, ALL_RULES); // no memory: the player drew those lines themselves
      if (h.kind !== 'deduction') { result = `no hint (${h.kind})`; break; }
      if (h.deduction.segments.includes(edge)) { result = `hint ${step} draws it with ${h.deduction.rule}${h.deduction.cells ? ` (${h.deduction.cells.length} tiles)` : ''}`; break; }
      st = applyStep(st, { segments: h.deduction.segments, xs: h.deduction.xs, byRule: {}, solved: false });
    }
    record(NAME, `player drew the first ${k} moves: ${result}`);
  }
});
