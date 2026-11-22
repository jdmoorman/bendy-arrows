import { encodePuzzle } from '../../src/codec';
import { openTilesOk, portFor, randomHamiltonian, seededRandom } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { cellAt, cellRC, createPuzzle, edgeBetween, edgeCells, portCell, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { symmetryOf } from '../../src/symmetry';
import { record } from '../out';

/**
 * Offset-symmetry puzzles on bigger boards, grown rather than guessed: random obstacles there
 * almost never give one solution. Start with a mirrored pair or two of black tiles and ends
 * taken from a random path (so there's a solution), then keep adding mirrored pairs (black tiles,
 * now and then walls) that narrow the solutions down, until one is left. The mirror leaves a
 * strip of 1–2 rows at the top out, as in BiouuR74XSs.
 * Output: offset-symmetry/<OUT>-<run>.tsv (code, size, hints, path echo, hint areas) and why
 * tries were dropped in <OUT>-log-<run>.txt.
 */
export function grow(run: number, minutes = Number(process.env.RESEARCH_MINUTES ?? 3)) {
  const rand = seededRandom(5000 + run);
  const pick = (n: number) => Math.floor(rand() * n);
  const minW = Number(process.env.MIN_W ?? 7);
  const maxW = Number(process.env.MAX_W ?? 9);
  const maxH = Number(process.env.MAX_H ?? 12);
  const wallShare = Number(process.env.WALL_SHARE ?? 0.25);
  const out = process.env.OUT ?? 'grow';
  const end = Date.now() + minutes * 60_000;
  const drops: Record<string, number> = {};
  const drop = (why: string) => (drops[why] = (drops[why] ?? 0) + 1);
  let tries = 0;
  const count = (p: Puzzle) => {
    const r = solve(p, { maxSolutions: 40, nodeLimit: 300_000 });
    return r.status === 'aborted' && r.solutions.length < 40 ? 40 : r.solutions.length;
  };
  while (Date.now() < end) {
    tries++;
    if (tries % 10 === 0) record(`offset-symmetry/${out}-log-${run}.txt`, `${tries} ${JSON.stringify(drops)}`);
    const w = minW + pick(maxW - minW + 1);
    const h = w + 1 + pick(Math.max(1, Math.min(w, maxH - w)));
    const strip = 1 + pick(2);
    const half = Math.ceil((h - strip) / 2);
    const mirror = (cell: number) => {
      const [r, c] = cellRC({ w, h }, cell);
      return r < strip ? -1 : cellAt({ w, h }, strip + h - 1 - r, c);
    };
    const p: Puzzle = createPuzzle(w, h);
    /** Add a mirrored pair (a black tile, or a wall) in the top half of the mirrored part; how to undo it, or null. */
    const addPair = (): (() => void) | null => {
      if (rand() < wallShare) {
        const a = cellAt(p, strip + pick(Math.floor((h - strip) / 2)), pick(w - 1));
        const es = [edgeBetween(p, a, a + 1), edgeBetween(p, mirror(a), mirror(a + 1))].filter((e) => !p.walls.has(e));
        if (!es.length) return null;
        for (const e of es) p.walls.add(e);
        return () => es.forEach((e) => p.walls.delete(e));
      }
      const c = cellAt(p, strip + pick(half), pick(w));
      const cs = [c, mirror(c)].filter((x) => !p.blocked.has(x));
      if (!cs.length) return null;
      for (const x of cs) p.blocked.add(x);
      if (!openTilesOk(p) || p.endpoints.some((e) => p.blocked.has(portCell(p, e.port)))) {
        for (const x of cs) p.blocked.delete(x);
        return null;
      }
      return () => cs.forEach((x) => p.blocked.delete(x));
    };
    // Black tiles first, in mirrored pairs.
    const tilePairs = 2 + pick(Math.max(2, Math.floor(w / 2)));
    for (let i = 0; i < 3 * tilePairs && p.blocked.size < 2 * tilePairs; i++) {
      const c = cellAt(p, strip + pick(half), pick(w));
      const cs = [c, mirror(c)].filter((x) => !p.blocked.has(x));
      for (const x of cs) p.blocked.add(x);
      if (!openTilesOk(p)) for (const x of cs) p.blocked.delete(x);
    }
    // The solution to keep: a random path, its ends the puzzle's ends.
    const order = randomHamiltonian(p, rand);
    if (!order) {
      drop('no path');
      continue;
    }
    p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
    const keep = new Set(order.slice(1).map((c, i) => edgeBetween(p, order[i], c)));
    // Rule out other solutions with mirrored pairs of walls the kept path doesn't cross.
    let unique = false;
    for (let k = 0; k < 3 * w * h && Date.now() < end; k++) {
      const r = solve(p, { maxSolutions: 2, nodeLimit: 300_000 });
      if (r.status === 'unique') {
        unique = true;
        break;
      }
      if (r.status !== 'multiple') break;
      const other = r.solutions.find((s) => s.some((e) => !keep.has(e)));
      if (!other) break;
      const options = other.filter((e) => {
        if (keep.has(e)) return false;
        const [a, b] = edgeCells(p, e);
        const ma = mirror(a);
        const mb = mirror(b);
        // In the strip a wall has no partner, which is fine (the strip breaks the symmetry anyway).
        return ma < 0 || mb < 0 || !keep.has(edgeBetween(p, ma, mb));
      });
      if (!options.length) break;
      const e = options[pick(options.length)];
      p.walls.add(e);
      const [a, b] = edgeCells(p, e);
      if (mirror(a) >= 0 && mirror(b) >= 0) p.walls.add(edgeBetween(p, mirror(a), mirror(b)));
    }
    if (!unique) {
      drop('not unique');
      continue;
    }
    if (symmetryOf(p)) {
      drop('symmetric');
      continue;
    }
    const j = hintJourney(p);
    if (j.outcome !== 'solved' || j.steps.length < 2) {
      drop(j.outcome !== 'solved' ? 'stuck' : 'few hints');
      continue;
    }
    const path = new Set(solve(p, { maxSolutions: 1 }).solutions[0]);
    let inside = 0;
    let echoed = 0;
    for (const e of path) {
      const [a, b] = edgeCells(p, e);
      if (mirror(a) < 0 || mirror(b) < 0) continue;
      inside++;
      if (path.has(edgeBetween(p, mirror(a), mirror(b)))) echoed++;
    }
    const echo = inside ? echoed / inside : 0;
    record(`offset-symmetry/${out}-${run}.tsv`, [encodePuzzle(p), `${w}x${h}`, j.steps.length, echo.toFixed(2), j.steps.map((s) => s.rule + (s.area ?? '')).join(' ')].join('\t'));
  }
  return tries;
}
