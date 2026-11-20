import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { EASY_RULES } from '../../src/generator';
import { applyStep, deductions, logicStep, type Deduction, type LogicState } from '../../src/logic';
import { cellEdges, edgeCells, endpointCells, isUsableEdge, neighbors, type Puzzle } from '../../src/model';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

// The one 3-border area the old search finds and the labels don't: what is it?
const NAME = 'cuts/one.txt';
const keyOf = (d: Deduction) => JSON.stringify([[...d.cells!].sort((a, b) => a - b), [...d.segments].sort(), [...d.xs].sort()]);
test('the odd one out', () => {
  writeFileSync(outPath(NAME), '');
  const s = SAMPLES.find((x) => x.name === 'Loop 9×10 · 16 obstacles')!;
  const p: Puzzle = decodePuzzle(s.code);
  let st: LogicState = { segments: new Set(), xs: new Set() };
  const path: LogicState[] = [];
  for (let i = 0; i < 300; i++) {
    const step = logicStep(p, st, EASY_RULES);
    if (!step.segments.length && !step.xs.length) break;
    st = applyStep(st, step);
    path.push(st);
  }
  // The board with 67 lines, where the mismatch showed up.
  st = path.find((x) => x.segments.size === 67) ?? st;
  record(NAME, `state: ${st.segments.size} lines, ${st.xs.size} X (stall has ${path.at(-1)!.segments.size} lines)`);
  const a = new Set(deductions(p, st, ['balance'], { areaSources: ['cuts3'], threeCuts: 'labels' }).map(keyOf));
  const two = new Set(deductions(p, st, ['balance'], { areaSources: ['cuts'] }).map(keyOf));
  const extra = deductions(p, st, ['balance'], { areaSources: ['cuts3'], threeCuts: 'search' }).filter((d) => !a.has(keyOf(d)) && !two.has(keyOf(d)));
  // The engine's view of borders: usable, not X, and either drawn or not closed by a full tile.
  const deg = new Map<number, number>();
  for (const e of st.segments) for (const c of edgeCells(p, e)) deg.set(c, (deg.get(c) ?? 0) + 1);
  const ends = new Set(endpointCells(p));
  const full = (c: number) => (deg.get(c) ?? 0) >= (ends.has(c) ? 1 : 2);
  const live = (e: number) => isUsableEdge(p, e) && !st.xs.has(e) && (st.segments.has(e) || !edgeCells(p, e).some(full));
  const marks = (d: Deduction) => JSON.stringify([[...d.segments].sort(), [...d.xs].sort()]);
  const twoMarks = new Set(deductions(p, st, ['balance'], { areaSources: ['cuts'] }).map(marks));
  const allMarks = new Set(deductions(p, st, ['balance']).map(marks));
  for (const d of extra) record(NAME, `marks ${marks(d)}: also from 2-border cuts? ${twoMarks.has(marks(d))}; from the engine's normal areas? ${allMarks.has(marks(d))}`);
  for (const d of extra.slice(0, 1)) {
    const area = new Set(d.cells!);
    const out: string[] = [];
    for (const c of area) for (const e of cellEdges(p, c)) {
      const o = edgeCells(p, e).find((x) => x !== c)!;
      if (!area.has(o) && live(e)) out.push(`${Math.floor(c / p.w) + 1},${(c % p.w) + 1}→${Math.floor(o / p.w) + 1},${(o % p.w) + 1}${st.segments.has(e) ? ' (line)' : ''}`);
    }
    let pieces = 0;
    const seen = new Set<number>();
    for (const c of area) {
      if (seen.has(c)) continue;
      pieces++;
      const q = [c];
      seen.add(c);
      while (q.length) { const t = q.pop()!; for (const m of neighbors(p, t)) if (area.has(m) && !seen.has(m)) { seen.add(m); q.push(m); } }
    }
    const grid = Array.from({ length: p.h }, (_, r) => '   ' + Array.from({ length: p.w }, (_, c) => (p.blocked.has(r * p.w + c) ? '#' : area.has(r * p.w + c) ? 'X' : '.')).join(' ')).join('\n');
    record(NAME, `area of ${area.size} tiles, ${pieces} piece(s), ${out.length} live borders out: ${out.join('  ')}\n${grid}`);
  }
});
