import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { runLogic, type LogicState } from '../../src/logic';
import { cellEdges, edgeCells, endpointCells, isUsableEdge, modeOf, neighbors, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// Replay the engine's room growth (borders counted open or drawn; 8 tie-break orders) from every
// tile of AREA, and report where each attempt first leaves the area.
const NAME = 'look/room-reach.txt';
const cell = (p: Puzzle, s: string) => { const [r, c] = s.split(',').map(Number); return (r - 1) * p.w + (c - 1); };
test('room reach', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const target = new Set(process.env.AREA!.split(' ').map((x) => cell(p, x)));
  const rc = (c: number) => `${Math.floor(c / p.w) + 1},${(c % p.w) + 1}`;
  for (const [label, s] of [['empty board', { segments: new Set<number>(), xs: new Set<number>() }], ['where the rating rules stall', runLogic(p, RATING_RULES).state]] as [string, LogicState][]) {
    const deg = new Map<number, number>();
    for (const e of s.segments) for (const c of edgeCells(p, e)) deg.set(c, (deg.get(c) ?? 0) + 1);
    const ends = new Set(modeOf(p) === 'cycle' ? [] : endpointCells(p));
    const full = (c: number) => (deg.get(c) ?? 0) >= (ends.has(c) ? 1 : 2);
    // The engine's borders: usable, not X, and drawn or not closed by a full tile.
    const live = (e: number) => isUsableEdge(p, e) && !s.xs.has(e) && (s.segments.has(e) || !edgeCells(p, e).some(full));
    const other = (e: number, c: number) => edgeCells(p, e).find((x) => x !== c)!;
    const orders: ((c: number) => number)[] = [];
    for (const tr of [false, true]) for (const rd of [1, -1]) for (const cd of [1, -1]) orders.push((c) => {
      const r = Math.floor(c / p.w), col = c % p.w, rr = rd === 1 ? r : p.h - 1 - r, cc = cd === 1 ? col : p.w - 1 - col;
      return tr ? cc * p.h + rr : rr * p.w + cc;
    });
    record(NAME, `== ${label}`);
    const leaves = new Map<string, number>();
    let reached = 0;
    for (const seed of target) for (const rank of orders) {
      const area = [seed];
      const inA = new Set(area);
      let note = '';
      while (area.length < target.size) {
        let best = -1, bd = Infinity, bt = -1;
        const ties: number[] = [];
        for (const t of area) for (const m of neighbors(p, t)) {
          if (inA.has(m) || p.blocked.has(m)) continue;
          let d = 0;
          for (const e of cellEdges(p, m)) if (live(e)) d += inA.has(other(e, m)) ? -1 : 1;
          const touch = neighbors(p, m).filter((x) => inA.has(x)).length;
          if (d < bd || (d === bd && touch > bt)) { best = m; bd = d; bt = touch; ties.length = 0; ties.push(m); }
          else if (d === bd && touch === bt && !ties.includes(m)) { ties.push(m); if (rank(m) < rank(best)) best = m; }
        }
        if (best < 0) break;
        if (!target.has(best)) {
          note = `leaves the area after ${area.length} tiles: adds ${rc(best)} (+${bd}${ties.length > 1 ? `, tied with ${ties.filter((x) => x !== best).map(rc).join(' ')}` : ''})`;
          break;
        }
        area.push(best);
        inA.add(best);
      }
      if (!note) reached++;
      else leaves.set(note, (leaves.get(note) ?? 0) + 1);
    }
    record(NAME, `  ${reached} of ${target.size * 8} (seed, order) attempts reach the area`);
    for (const [k, v] of [...leaves].sort((a, b) => b[1] - a[1]).slice(0, 8)) record(NAME, `  ${v}× ${k}`);
  }
});
