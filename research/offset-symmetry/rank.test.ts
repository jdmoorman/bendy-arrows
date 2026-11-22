import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { hintJourney, type JourneyFrame } from '../../src/logic';
import { cellAt, cellRC, edgeBetween, edgeCells, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';

// Ranks offset-symmetry finds (and BiouuR74XSs, for comparison) by how differently the echoed
// halves are solved. Deduction echo: of the path's lines whose mirror image is on the path too,
// the share whose mirror was worked out at the same step (the same easy-rules run, or the same
// hint). Low means the halves look alike but are reasoned out separately.
// Output: offset-symmetry/ranked.txt.

function mirrorOf(p: Puzzle): ((c: number) => number) | null {
  for (const strip of [0, 1, 2]) {
    const m = (cell: number) => {
      const [r, c] = cellRC(p, cell);
      return r < strip ? -1 : cellAt(p, strip + p.h - 1 - r, c);
    };
    const ok = [...p.blocked].every((c) => m(c) >= 0 && p.blocked.has(m(c)));
    if (ok && p.blocked.size) return m;
  }
  return null;
}

test('rank offset symmetry', () => {
  const dir = outPath('offset-symmetry');
  const rows = readdirSync(dir)
    .filter((f) => /^found-\d+\.tsv$/.test(f))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
    .map((l) => l.split('\t'));
  rows.push(['BiouuR74XSs', '6x9', '3', '', '(yours)']);
  const out: { line: string; score: number }[] = [];
  for (const [code, size, hints, , rules] of rows) {
    const p = decodePuzzle(code);
    const m = mirrorOf(p);
    if (!m) continue;
    const frames: JourneyFrame[] = [];
    hintJourney(p, {}, (f) => frames.push(f));
    const when = new Map<number, number>();
    frames.forEach((f, i) => f.segments.forEach((e) => when.has(e) || when.set(e, i)));
    const path = new Set(solve(p, { maxSolutions: 1 }).solutions[0]);
    let pairs = 0;
    let echoed = 0;
    let same = 0;
    let inside = 0;
    for (const e of path) {
      const [a, b] = edgeCells(p, e);
      if (m(a) < 0 || m(b) < 0) continue;
      inside++;
      const me = edgeBetween(p, m(a), m(b));
      if (me === e || !path.has(me)) continue;
      echoed++;
      if (e < me) {
        pairs++;
        if (when.get(e) === when.get(me)) same++;
      }
    }
    const pathEcho = echoed / inside;
    const dedEcho = pairs ? same / pairs : 0;
    // Wanted: shapes repeat (path echo high), reasoning doesn't (deduction echo low), several hints.
    const score = pathEcho * (1 - dedEcho) * Math.min(+hints, 6);
    out.push({ score, line: `${code}\t${size}\thints ${hints}\tpath echo ${pathEcho.toFixed(2)}\tdeduction echo ${dedEcho.toFixed(2)}\tscore ${score.toFixed(2)}\t${rules}` });
  }
  for (const r of out.sort((a, b) => b.score - a.score)) record('offset-symmetry/ranked.txt', r.line);
});
