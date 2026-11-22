import { encodePuzzle } from '../../src/codec';
import { openTilesOk, seededRandom } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { cellAt, cellRC, createPuzzle, edgeBetween, edgeCells, portCell, portCount, portEnd, type Puzzle } from '../../src/model';
import { parityCheck, solve } from '../../src/solver';
import { symmetryOf } from '../../src/symmetry';
import { record } from '../out';

/**
 * Puzzles like BiouuR74XSs: the obstacles are mirror-symmetric about an axis that isn't the
 * board's middle (a spare strip of rows or columns on one side breaks the symmetry), and the ends
 * don't follow it either. So stretches of the solution echo each other but are reached and
 * worked out differently.
 *
 * Each try: a board, a strip width, black tiles (and some walls) placed in mirrored pairs
 * inside the rest, two ends anywhere. Kept if the solution is unique, it needs at least two
 * hints, the whole board isn't symmetric, and some of the path echoes across the axis.
 * Output: offset-symmetry/found.tsv (code, size, hints, echo, rules).
 */
export function search(run: number, minutes = Number(process.env.RESEARCH_MINUTES ?? 3)) {
  const rand = seededRandom(1000 + run);
  const pick = (n: number) => Math.floor(rand() * n);
  const end = Date.now() + minutes * 60_000;
  let tries = 0;
  // Why tries were dropped, logged now and then (offset-symmetry/<out>-log-<run>.txt).
  const drops: Record<string, number> = {};
  const drop = (why: string) => {
    drops[why] = (drops[why] ?? 0) + 1;
  };
  while (Date.now() < end) {
    tries++;
    if (tries % 20 === 0) record(`offset-symmetry/${process.env.OUT ?? 'found'}-log-${run}.txt`, `${tries} ${JSON.stringify(drops)}`);
    // Sizes from MIN_W..MAX_W wide, taller than wide, at most MAX_H tall.
    const minW = Number(process.env.MIN_W ?? 5);
    const maxW = Number(process.env.MAX_W ?? 7);
    const maxH = Number(process.env.MAX_H ?? 10);
    const w = minW + pick(maxW - minW + 1);
    // At least MIN_H tall (and taller than wide), at most MAX_H.
    const minH = Math.max(w + 1, Number(process.env.MIN_H ?? 0));
    const h = minH + pick(Math.max(1, Math.min(2 * w, maxH) - minH + 1));
    const strip = 1 + pick(2);
    // Mirror rows strip..h-1 onto each other (the strip of rows at the top is left out).
    const mirror = (cell: number) => {
      const [r, c] = cellRC({ w, h }, cell);
      return r < strip ? -1 : cellAt({ w, h }, strip + h - 1 - r, c);
    };
    const p: Puzzle = createPuzzle(w, h);
    const pairs = 2 + pick(Math.max(3, Math.floor(w / 2)));
    for (let i = 0; i < pairs; i++) {
      const c = cellAt(p, strip + pick(Math.ceil((h - strip) / 2)), pick(w));
      p.blocked.add(c);
      p.blocked.add(mirror(c));
    }
    const wallPairs = process.env.TILES_ONLY ? 0 : pick(3);
    for (let i = 0; i < wallPairs; i++) {
      const a = cellAt(p, strip + pick(Math.floor((h - strip) / 2)), pick(w - 1));
      const e = edgeBetween(p, a, a + 1);
      const m = edgeBetween(p, mirror(a), mirror(a + 1));
      p.walls.add(e);
      p.walls.add(m);
    }
    if (!openTilesOk(p)) {
      drop('open');
      continue;
    }
    // Ends: up to 8 pairs on the right checkerboard colours (and not making the board symmetric),
    // the first that gives exactly one solution.
    const ports = portCount(p);
    let r: ReturnType<typeof solve> | null = null;
    for (let k = 0; k < 8 && r?.status !== 'unique'; k++) {
      let ok = false;
      for (let t = 0; t < 30 && !ok; t++) {
        p.endpoints = [portEnd(pick(ports)), portEnd(pick(ports))];
        ok = p.endpoints[0].port !== p.endpoints[1].port && !p.blocked.has(portCell(p, p.endpoints[0].port)) && !p.blocked.has(portCell(p, p.endpoints[1].port)) && parityCheck(p).ok && !symmetryOf(p);
      }
      if (!ok) break;
      r = solve(p, { maxSolutions: 2, nodeLimit: 200_000 });
    }
    if (!r || r.status !== 'unique') {
      drop(r ? r.status : 'no ends');
      continue;
    }
    const j = hintJourney(p);
    if (j.outcome !== 'solved' || j.steps.length < 2) {
      drop(j.outcome !== 'solved' ? 'stuck' : 'few hints');
      continue;
    }
    // Echo: of the path's lines inside the mirrored part, how many have their mirror image in the path too.
    const path = new Set(r.solutions[0]);
    let inside = 0;
    let echoed = 0;
    for (const e of path) {
      const [a, b] = edgeCells(p, e);
      if (mirror(a) < 0 || mirror(b) < 0) continue;
      inside++;
      if (path.has(edgeBetween(p, mirror(a), mirror(b)))) echoed++;
    }
    const echo = inside ? echoed / inside : 0;
    if (echo < Number(process.env.MIN_ECHO ?? 0.4)) {
      drop('echo');
      continue;
    }
    record(`offset-symmetry/${process.env.OUT ?? 'found'}-${run}.tsv`, [encodePuzzle(p), `${w}x${h}`, j.steps.length, echo.toFixed(2), j.steps.map((s) => s.rule + (s.area ? s.area : '')).join(' ')].join('\t'));
  }
  return tries;
}
