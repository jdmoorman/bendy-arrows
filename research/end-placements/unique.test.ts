import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { encodePuzzle } from '../../src/codec';
import { createPuzzle, edgeCells, portCell, portCount, portEnd, portSide, transformPuzzle, type Puzzle, type Transform } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Open boards (no walls or black tiles): which pairs of frame ends give a unique path?
// Ends are an unordered pair (swapping entrance and exit gives the same lines), an end
// on either border of a corner tile counts as the same placement (only its tile matters
// to the path), and placements that are flips or rotations of each other count once.
const NAME = 'end-placements/unique.txt';
/** The unique ones as a list the Library's Import reads: "Name — #p=CODE" per line. */
const LIST = 'end-placements/unique-levels.txt';
// Every board from 2×2 to 6×6, one way round (a w×h board is a quarter turn of h×w): wider
// than tall, except 2×3, kept as first searched so its puzzles' codes stay the same.
const SIZES: [number, number][] = [];
for (let h = 2; h <= 6; h++) for (let w = h; w <= 6; w++) SIZES.push(w === 3 && h === 2 ? [2, 3] : [w, h]);
SIZES.sort((a, b) => a[0] * a[1] - b[0] * b[1] || a[0] - b[0]);

/** Every symmetry that keeps the board's width and height (all eight for a square). */
function symmetries(w: number, h: number): Transform[][] {
  const keep: Transform[][] = [[], ['flipH'], ['flipV'], ['flipH', 'flipV']];
  return w === h ? [...keep, ['rotateRight'], ['rotateLeft'], ['rotateRight', 'flipH'], ['rotateLeft', 'flipH']] : keep;
}

const withEnds = (w: number, h: number, a: number, b: number): Puzzle => ({ ...createPuzzle(w, h), endpoints: [portEnd(a), portEnd(b)] });
const pairKey = (p: Puzzle) => p.endpoints.map((e) => portCell(p, e.port)).sort((x, y) => x - y).join(',');

function canonical(w: number, h: number, a: number, b: number): string {
  const keys = symmetries(w, h).map((ts) => pairKey(ts.reduce((p, t) => transformPuzzle(p, t), withEnds(w, h, a, b))));
  return keys.sort()[0];
}

/** "top of B1", or "corner A1" (either of its borders): the tile as column letter and row from 1. */
function describePort(p: Puzzle, port: number): string {
  const cell = portCell(p, port);
  const r = Math.floor(cell / p.w);
  const c = cell % p.w;
  const name = `${String.fromCharCode(65 + c)}${r + 1}`;
  const corner = (r === 0 || r === p.h - 1) && (c === 0 || c === p.w - 1) && p.w > 1 && p.h > 1;
  return corner ? `corner ${name}` : `${portSide(p, port)[0]} of ${name}`;
}

/** The path as a grid of step numbers (1 at the entrance). */
function drawPath(p: Puzzle, edges: number[], start: number): string {
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    const [x, y] = edgeCells(p, e);
    adj.set(x, [...(adj.get(x) ?? []), y]);
    adj.set(y, [...(adj.get(y) ?? []), x]);
  }
  const order = [start];
  while (order.length < p.w * p.h) {
    const next = (adj.get(order[order.length - 1]) ?? []).find((c) => !order.includes(c));
    if (next === undefined) break;
    order.push(next);
  }
  const step = new Map(order.map((c, i) => [c, i + 1]));
  const width = String(p.w * p.h).length;
  const rows: string[] = [];
  for (let r = 0; r < p.h; r++) {
    rows.push('    ' + Array.from({ length: p.w }, (_, c) => String(step.get(r * p.w + c)).padStart(width)).join(' '));
  }
  return rows.join('\n');
}

test('unique end placements on open boards', () => {
  writeFileSync(outPath(NAME), '');
  writeFileSync(outPath(LIST), '');
  for (const [w, h] of SIZES) {
    const t0 = Date.now();
    const seen = new Set<string>();
    const counts = { unique: 0, multiple: 0, none: 0, aborted: 0 };
    const uniques: string[] = [];
    const n = portCount({ w, h });
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        // Both ends on one tile (a corner's two borders) is not a placement.
        if (portCell({ w, h }, a) === portCell({ w, h }, b)) continue;
        const key = canonical(w, h, a, b);
        if (seen.has(key)) continue;
        seen.add(key);
        const p = withEnds(w, h, a, b);
        const r = solve(p, { maxSolutions: 2 });
        counts[r.status]++;
        if (r.status === 'unique') {
          record(LIST, `Open ${w}×${h}: ${describePort(p, a)} to ${describePort(p, b)} — #p=${encodePuzzle(p)}`);
          uniques.push(`  ends: ${describePort(p, a)} and ${describePort(p, b)}\n${drawPath(p, r.solutions[0], portCell(p, a))}`);
        }
      }
    }
    record(NAME, `${w}x${h}: ${seen.size} placements up to symmetry — ${counts.unique} unique, ${counts.multiple} multiple, ${counts.none} none${counts.aborted ? `, ${counts.aborted} gave up` : ''} (${Date.now() - t0} ms)`);
    for (const u of uniques) record(NAME, u);
    record(NAME, '');
  }
});
