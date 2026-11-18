import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { ADVANCED_RULES, ALL_RULES, runLogic, type LogicState } from '../../src/logic';
import { edgeBetween, endTile, type Puzzle } from '../../src/model';
import { columnName } from '../../src/render';
import { outPath, record } from '../out';

// Draw a puzzle with the app's coordinates (columns A…, rows 1…), the lines the easy rules draw,
// and EDGE marked with ?. EDGE uses the app's names, e.g. "H10 I10".
const NAME = 'look/board.txt';
const parse = (p: Puzzle, s: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(s)!;
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return (Number(m[2]) - 1) * p.w + col;
};
function draw(p: Puzzle, s: LogicState, mark: number): string {
  const ends = new Set(p.endpoints.map((e) => endTile(p, e)));
  const out = ['     ' + Array.from({ length: p.w }, (_, c) => columnName(c).padEnd(4)).join('')];
  for (let r = 0; r < p.h; r++) {
    let row = String(r + 1).padStart(3) + '  ';
    let below = '     ';
    for (let c = 0; c < p.w; c++) {
      const i = r * p.w + c;
      row += p.blocked.has(i) ? '#' : ends.has(i) ? 'E' : p.checkpoints.includes(i) ? String(p.checkpoints.indexOf(i) + 1) : 'o';
      if (c < p.w - 1) {
        const e = edgeBetween(p, i, i + 1);
        row += e === mark ? (s.segments.has(e) ? '=?=' : ' ? ') : p.walls.has(e) ? ' | ' : s.segments.has(e) ? '===' : s.xs.has(e) ? ' x ' : '   ';
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
test('board', () => {
  writeFileSync(outPath(NAME), 'o tile, # black, E end, digits = numbers; | - walls; === ‖ lines; x X marks; ? the edge (=?= if drawn)\n');
  const p = decodePuzzle(process.env.CODE!);
  const [a, b] = process.env.EDGE!.split(' ').map((x) => parse(p, x));
  const edge = edgeBetween(p, a, b);
  record(NAME, `\nempty board:\n${draw(p, { segments: new Set(), xs: new Set() }, edge)}`);
  const run = runLogic(p, ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r)));
  record(NAME, `\nafter the easy rules (${run.state.segments.size} lines; edge drawn: ${run.state.segments.has(edge)}):\n${draw(p, run.state, edge)}`);
});
