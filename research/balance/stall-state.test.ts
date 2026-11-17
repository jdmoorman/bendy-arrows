import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { EASY_RULES } from '../../src/generator';
import { applyStep, logicStep, type LogicState } from '../../src/logic';
import { cellEdges, edgeBetween, edgeCells, isUsableEdge, type Puzzle } from '../../src/model';
import { decodePuzzle } from '../../src/codec';
import { clonePuzzle, endpointCells } from '../../src/model';
import { outPath, record } from '../out';

const NAME = 'balance/stall-state.txt';
const A = decodePuzzle('BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA');
const B = clonePuzzle(A);
B.walls = new Set([edgeBetween(A, 2 * 7 + 1, 3 * 7 + 1), edgeBetween(A, 3 * 7 + 1, 3 * 7 + 2)]);
const TARGET = edgeBetween(A, 6 * 7 + 2, 6 * 7 + 3);
// The 10-tile L the balance deduction uses.
const L = [3 * 7, 3 * 7 + 1, 4 * 7, 4 * 7 + 1, 5 * 7, 5 * 7 + 1, 5 * 7 + 2, 6 * 7, 6 * 7 + 1, 6 * 7 + 2];

function easyStall(p: Puzzle): LogicState {
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i < 200; i++) {
    const st = logicStep(p, s, EASY_RULES);
    if (!st.segments.length && !st.xs.length) break;
    s = applyStep(s, st);
  }
  return s;
}

/** Board with walls, drawn lines (= and ‖), X marks (x), the L (o) and shaded tiles in lowercase. */
function drawState(p: Puzzle, s: LogicState): string {
  const inL = new Set(L);
  const out: string[] = [];
  for (let r = 0; r < p.h; r++) {
    let row = '';
    let below = '';
    for (let c = 0; c < p.w; c++) {
      const i = r * p.w + c;
      const shaded = (r + c) % 2 === 1;
      row += inL.has(i) ? (shaded ? 'O' : 'o') : shaded ? '+' : '.';
      if (c < p.w - 1) {
        const e = edgeBetween(p, i, i + 1);
        row += p.walls.has(e) ? ' | ' : s.segments.has(e) ? '===' : s.xs.has(e) ? ' x ' : '   ';
      }
      if (r < p.h - 1) {
        const e = edgeBetween(p, i, i + p.w);
        below += (p.walls.has(e) ? '-' : s.segments.has(e) ? '‖' : s.xs.has(e) ? 'x' : ' ') + '   ';
      }
    }
    out.push(row, below);
  }
  return out.join('\n');
}

test('state after the easy rules stall', () => {
  writeFileSync(outPath(NAME), 'o/O = the L (O shaded), +/. = other tiles (+ shaded); | and - walls; === and ‖ lines; x X marks\n');
  for (const [label, p] of [['A (all walls)', A], ['B (two walls)', B]] as const) {
    const s = easyStall(p);
    const degree = new Map<number, number>();
    for (const e of s.segments) for (const c of edgeCells(p, e)) degree.set(c, (degree.get(c) ?? 0) + 1);
    const ends = new Set(endpointCells(p));
    const full = (c: number) => (degree.get(c) ?? 0) >= (ends.has(c) ? 1 : 2);
    // Borders out of the L, by the colour of the L's tile.
    const inL = new Set(L);
    const rows: string[] = [];
    let diff = 0;
    for (const c of L) diff += ((Math.floor(c / 7) + (c % 7)) % 2 === 1 ? 1 : -1);
    for (const c of L) {
      for (const e of cellEdges(p, c)) {
        const o = edgeCells(p, e).find((x) => x !== c)!;
        if (inL.has(o) || !isUsableEdge(p, e)) continue;
        const shaded = (Math.floor(c / 7) + (c % 7)) % 2 === 1;
        const state = s.segments.has(e) ? 'LINE' : s.xs.has(e) ? 'X' : full(c) || full(o) ? 'closed (a tile is full)' : 'open';
        rows.push(`   ${shaded ? 'shaded' : 'white '} ${[c, o].map((x) => `${Math.floor(x / 7)},${x % 7}`).join('-')}: ${state}${e === TARGET ? '   <- the edge' : ''}`);
      }
    }
    record(NAME, `\n===== ${label}: ${s.segments.size} lines, ${s.xs.size} X; edge drawn already: ${s.segments.has(TARGET)}\n${drawState(p, s)}\nL: shaded minus white tiles = ${diff}\nborders out of the L:\n${rows.join('\n')}`);
  }
});
