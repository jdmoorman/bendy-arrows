import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { runLogic, type LogicState } from '../../src/logic';
import { clonePuzzle, edgeBetween, edgeCells, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Is an edge forced, given where the logic got stuck? Wall it off (and the X's), then look
// for a solution that still uses every line the logic drew.
const NAME = 'look/forced.txt';
const rc1 = (p: Puzzle, c: number) => `${Math.floor(c / p.w) + 1},${(c % p.w) + 1}`;

/** Text board in 1-based coordinates, with = and ‖ for lines, x for X marks, | and - for walls. */
function drawState(p: Puzzle, s: LogicState, mark: number): string {
  const out: string[] = ['    ' + Array.from({ length: p.w }, (_, c) => String(c + 1).padEnd(4)).join('')];
  for (let r = 0; r < p.h; r++) {
    let row = String(r + 1).padStart(2) + '  ';
    let below = '    ';
    for (let c = 0; c < p.w; c++) {
      const i = r * p.w + c;
      row += 'o';
      if (c < p.w - 1) {
        const e = edgeBetween(p, i, i + 1);
        row += e === mark ? ' ? ' : p.walls.has(e) ? ' | ' : s.segments.has(e) ? '===' : s.xs.has(e) ? ' x ' : '   ';
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

test('forced?', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [r, c1, c2] = process.env.EDGE!.split(',').map(Number); // 1-based row, two columns
  const edge = edgeBetween(p, (r - 1) * p.w + c1 - 1, (r - 1) * p.w + c2 - 1);
  for (const [label, rules] of [['all rules', RATING_RULES]] as const) {
    const run = runLogic(p, rules);
    const s = run.state;
    record(NAME, `== ${label}: ${run.solved ? 'solved' : 'stuck'} after ${run.rounds} rounds; edge drawn: ${s.segments.has(edge)}\n${drawState(p, s, edge)}`);
    // Look for a solution that avoids the edge but fits everything drawn.
    const q = clonePuzzle(p);
    q.walls = new Set([...p.walls, ...s.xs, edge]);
    const sols = solve(q, { maxSolutions: 2000 }).solutions;
    const fits = sols.filter((sol) => [...s.segments].every((e) => sol.includes(e)));
    record(NAME, `   solutions avoiding the edge (first ${sols.length} found): ${fits.length} fit every drawn line`);
    if (fits.length) {
      const sol = new Set(fits[0]);
      record(NAME, `   one of them:\n${drawState(p, { segments: sol, xs: new Set() }, edge)}`);
    }
  }
  void edgeCells;
  void rc1;
});
