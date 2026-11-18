import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { AREA_SOURCES, deductions, fastStep, applyStep, type LogicState } from '../../src/logic';
import { cellEdges, edgeBetween, edgeCells, isUsableEdge, type Puzzle } from '../../src/model';
import { columnName } from '../../src/render';
import { outPath, record } from '../out';

// Run the rating rules (with chains) round by round; when EDGE ("H10 I10") gets drawn, show the
// area of the deduction that drew it and recount its balance by hand. Also: would the same area
// draw it without chains (i.e. is it one only chains reaches)?
const NAME = 'chains/trace.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  return (Number(m[2]) - 1) * p.w + [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};
const name = (p: Puzzle, c: number) => `${columnName(c % p.w)}${Math.floor(c / p.w) + 1}`;
test('trace', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  const noChains = { areaSources: AREA_SOURCES.filter((x) => x !== 'chains') };
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let round = 1; round < 300; round++) {
    const ds = deductions(p, s, RATING_RULES).filter((d) => d.segments.includes(edge));
    if (ds.length) {
      const d = ds[0];
      const area = new Set(d.cells ?? []);
      const without = deductions(p, s, RATING_RULES, noChains).some((x) => x.segments.includes(edge));
      record(NAME, `round ${round}: drawn by ${d.rule}, area of ${area.size} tiles (${s.segments.size} lines, ${s.xs.size} X on the board); without chains this round: ${without ? 'also found' : 'NOT found'}`);
      const grid = ['     ' + Array.from({ length: p.w }, (_, c) => columnName(c)).join(' ')];
      for (let r = 0; r < p.h; r++) grid.push(String(r + 1).padStart(3) + '  ' + Array.from({ length: p.w }, (_, c) => (area.has(r * p.w + c) ? ((r + c) % 2 ? 'O' : 'X') : '.')).join(' '));
      record(NAME, `area (X white, O shaded):\n${grid.join('\n')}`);
      // Recount: tiles by colour, and borders out (usable, not X), split by colour and drawn/open.
      let shaded = 0, white = 0;
      const outB: string[] = [];
      for (const c of area) {
        (Math.floor(c / p.w) + (c % p.w)) % 2 ? shaded++ : white++;
        for (const e of cellEdges(p, c)) {
          const o = edgeCells(p, e).find((x) => x !== c)!;
          if (area.has(o) || !isUsableEdge(p, e) || s.xs.has(e)) continue;
          outB.push(`${name(p, c)}→${name(p, o)} (${(Math.floor(c / p.w) + (c % p.w)) % 2 ? 'shaded' : 'white'}, ${s.segments.has(e) ? 'line' : 'open'})`);
        }
      }
      record(NAME, `${shaded} shaded, ${white} white; borders out (not counting X'd or full-tile ones the engine closes):\n   ${outB.join('\n   ')}\nwhy: ${d.why}`);
      return;
    }
    const st = fastStep(p, s, RATING_RULES);
    if (!st.segments.length && !st.xs.length) { record(NAME, 'stuck before drawing it'); return; }
    s = applyStep(s, st);
  }
});
