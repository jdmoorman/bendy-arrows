import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { EASY_RULES } from '../../src/generator';
import { applyStep, logicStep, type LogicState } from '../../src/logic';
import { cellEdges, clonePuzzle, edgeBetween, edgeCells, endpointCells, isUsableEdge, neighbors, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Replays the engine's room growth (first reading order) to see which rooms contain the L.
const NAME = 'balance/rooms-trace.txt';
const A = decodePuzzle('BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA');
const B = clonePuzzle(A);
B.walls = new Set([edgeBetween(A, 2 * 7 + 1, 3 * 7 + 1), edgeBetween(A, 3 * 7 + 1, 3 * 7 + 2)]);
const L = new Set([21, 22, 28, 29, 35, 36, 37, 42, 43, 44]);
const rc = (c: number) => `${Math.floor(c / 7)},${c % 7}`;

function easyStall(p: Puzzle): LogicState {
  let s: LogicState = { segments: new Set(), xs: new Set() };
  for (let i = 0; i < 200; i++) {
    const st = logicStep(p, s, EASY_RULES);
    if (!st.segments.length && !st.xs.length) break;
    s = applyStep(s, st);
  }
  return s;
}

test('trace rooms', () => {
  writeFileSync(outPath(NAME), '');
  for (const [label, p] of [['A (all walls)', A], ['B (two walls)', B]] as const) {
    const s = easyStall(p);
    const n = p.w * p.h;
    const deg = new Int32Array(n);
    for (const e of s.segments) for (const c of edgeCells(p, e)) deg[c]++;
    const ends = new Set(endpointCells(p));
    const need = (c: number) => (ends.has(c) ? 1 : 2);
    // Open borders as the engine sees them: usable, not X, not a line, and not closed by a full tile.
    const open = (e: number) => {
      if (!isUsableEdge(p, e) || s.xs.has(e) || s.segments.has(e)) return false;
      return edgeCells(p, e).every((c) => deg[c] < need(c));
    };
    const other = (e: number, c: number) => edgeCells(p, e).find((x) => x !== c)!;
    record(NAME, `===== ${label}`);
    let hits = 0;
    // The engine's 8 reading orders, used to break ties.
    const orders: [string, (c: number) => number][] = [];
    for (const tr of [false, true]) for (const rd of [1, -1]) for (const cd of [1, -1]) {
      orders.push([`${tr ? 'columns' : 'rows'} ${rd === 1 ? 'top-down' : 'bottom-up'} ${cd === 1 ? 'left-right' : 'right-left'}`, (c: number) => {
        const r = Math.floor(c / p.w), col = c % p.w;
        const rr = rd === 1 ? r : p.h - 1 - r, cc = cd === 1 ? col : p.w - 1 - col;
        return tr ? cc * p.h + rr : rr * p.w + cc;
      }]);
    }
    for (const [orderName, rank] of orders)
    for (let seed = 0; seed < n; seed++) {
      const area = [seed];
      const inA = new Set(area);
      const steps: string[] = [rc(seed)];
      let tie = false;
      for (let size = 1; size < 24; size++) {
        let best = -1, bd = Infinity, bt = -1, ties = 0;
        const seen = new Set<number>();
        for (const t of area) for (const m of neighbors(p, t)) {
          if (inA.has(m) || seen.has(m)) continue;
          seen.add(m);
          let delta = 0;
          for (const e of cellEdges(p, m)) if (open(e)) delta += inA.has(other(e, m)) ? -1 : 1;
          const touch = neighbors(p, m).filter((x) => inA.has(x)).length;
          if (delta < bd || (delta === bd && touch > bt)) { best = m; bd = delta; bt = touch; ties = 0; }
          else if (delta === bd && touch === bt) { ties++; if (rank(m) < rank(best)) best = m; }
        }
        if (best < 0) break;
        if (ties) tie = true;
        area.push(best);
        inA.add(best);
        steps.push(`${rc(best)}(Δ${bd}${ties ? ',tie' : ''})`);
        if (area.length === L.size && area.every((c) => L.has(c))) {
          hits++;
          record(NAME, `  seed ${rc(seed)}, order ${orderName}, reaches the L: ${steps.join(' ')}`);
          break;
        }
      }
      void tie;
    }
    record(NAME, `  ${hits} (seed, order) pairs reach the L`);
  }
});
