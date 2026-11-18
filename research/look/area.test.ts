import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { deductions, runLogic, type LogicState } from '../../src/logic';
import { cellEdges, edgeBetween, edgeCells, endpointCells, isUsableEdge, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Check a hand-picked area for Checkerboard balance. CODE = puzzle, AREA = "r,c r,c ..." (1-based),
// EDGE = "r,c r,c" (1-based) the edge it should give. Draws the board where the rating rules stall.
const NAME = 'look/area.txt';
const cell = (p: Puzzle, s: string) => { const [r, c] = s.split(',').map(Number); return (r - 1) * p.w + (c - 1); };

function draw(p: Puzzle, s: LogicState, area: Set<number>, mark: number): string {
  const out: string[] = ['     ' + Array.from({ length: p.w }, (_, c) => String(c + 1).padEnd(4)).join('')];
  for (let r = 0; r < p.h; r++) {
    let row = String(r + 1).padStart(3) + '  ';
    let below = '     ';
    for (let c = 0; c < p.w; c++) {
      const i = r * p.w + c;
      const shaded = (r + c) % 2 === 1;
      row += p.blocked.has(i) ? '#' : area.has(i) ? (shaded ? 'O' : 'o') : shaded ? '+' : '.';
      if (c < p.w - 1) {
        const e = edgeBetween(p, i, i + 1);
        row += e === mark ? ' ? ' : p.walls.has(e) ? ' | ' : s.segments.has(e) ? '===' : s.xs.has(e) ? ' x ' : '   ';
      }
      if (r < p.h - 1) {
        const e = edgeBetween(p, i, i + p.w);
        below += (e === mark ? '?' : p.walls.has(e) ? '-' : s.segments.has(e) ? '‖' : s.xs.has(e) ? 'x' : ' ') + '   ';
      }
    }
    out.push(row, below);
  }
  return out.join('\n');
}

test('area', () => {
  writeFileSync(outPath(NAME), 'o/O = the area (O shaded), +/. = other tiles (+ shaded), # black; | - walls; === ‖ lines; x X marks; ? the edge\n');
  const p = decodePuzzle(process.env.CODE!);
  const area = new Set(process.env.AREA!.split(' ').map((x) => cell(p, x)));
  const [a, b] = process.env.EDGE!.split(' ').map((x) => cell(p, x));
  const edge = edgeBetween(p, a, b);
  record(NAME, `solutions: ${solve(p, { maxSolutions: 2 }).status}`);
  for (const [label, run] of [['empty board', { state: { segments: new Set<number>(), xs: new Set<number>() } }], ['where the rating rules stall', runLogic(p, RATING_RULES)]] as const) {
    const s = run.state;
    // Borders out of the area by colour, as the engine sees them.
    const deg = new Map<number, number>();
    for (const e of s.segments) for (const c of edgeCells(p, e)) deg.set(c, (deg.get(c) ?? 0) + 1);
    const ends = new Set(endpointCells(p));
    const full = (c: number) => (deg.get(c) ?? 0) >= (ends.has(c) ? 1 : 2);
    let diff = 0;
    for (const c of area) diff += (Math.floor(c / p.w) + (c % p.w)) % 2 === 1 ? 1 : -1;
    const counts = { shadedOpen: 0, shadedLine: 0, whiteOpen: 0, whiteLine: 0 };
    const whiteOpen: string[] = [];
    for (const c of area) for (const e of cellEdges(p, c)) {
      const o = edgeCells(p, e).find((x) => x !== c)!;
      if (area.has(o) || !isUsableEdge(p, e) || s.xs.has(e)) continue;
      const line = s.segments.has(e);
      if (!line && (full(c) || full(o))) continue;
      const shaded = (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
      if (shaded) line ? counts.shadedLine++ : counts.shadedOpen++;
      else { if (line) counts.whiteLine++; else { counts.whiteOpen++; whiteOpen.push(`${Math.floor(c / p.w) + 1},${(c % p.w) + 1}→${Math.floor(o / p.w) + 1},${(o % p.w) + 1}`); } }
    }
    const found = deductions(p, s, ['balance']).filter((d) => d.segments.includes(edge) || d.xs.includes(edge));
    record(NAME, `\n== ${label}: ${s.segments.size} lines, ${s.xs.size} X; edge drawn already: ${s.segments.has(edge)}\n${draw(p, s, area, edge)}`);
    record(NAME, `area: ${area.size} tiles, shaded minus white = ${diff}; borders out: shaded ${counts.shadedLine} lines + ${counts.shadedOpen} open, white ${counts.whiteLine} lines + ${counts.whiteOpen} open (${whiteOpen.join(' ')})`);
    record(NAME, `balance deductions that draw the edge here: ${found.length}${found.length ? ' — areas of ' + found.map((d) => d.cells!.length).join(', ') + ' tiles' : ''}`);
  }
});
