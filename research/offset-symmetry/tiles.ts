import { readdirSync, readFileSync } from 'node:fs';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { openTilesOk, seededRandom } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { cellAt, cellRC, clonePuzzle, createPuzzle, edgeBetween, edgeCells, portCell, portCount, portEnd, type Puzzle } from '../../src/model';
import { parityCheck, solve } from '../../src/solver';
import { symmetryOf } from '../../src/symmetry';
import { outPath, record } from '../out';

/**
 * Offset-symmetry puzzles with black tiles only (mirrored, or with SYM=turn turned 180°), found
 * more efficiently than search.ts:
 *  - black tiles go in one mirrored pair at a time, a pair that cuts the board up being tried
 *    again elsewhere instead of the whole layout being thrown away;
 *  - a layout with several solutions gets another mirrored pair (up to a few) rather than
 *    starting over;
 *  - `mutate` searches around good finds: one mirrored pair moved, or one end moved.
 * Kept: exactly one solution, the board as a whole not symmetric. Two hints or more go to
 * <OUT>-<run>.tsv, fewer (easy ones, for an easy pack) to <OUT>-easy-<run>.tsv. Columns: code,
 * size, hints, path echo, hint areas. Why tries were dropped: <OUT>-log-<run>.txt.
 */

type Mirror = (cell: number) => number;

const env = (k: string, d: number) => Number(process.env[k] ?? d);
const OUT = process.env.OUT ?? 'tiles2';

/**
 * The symmetry the black tiles follow, on the rows below a spare strip at the top: 'mirror'
 * reflects them top to bottom, 'turn' turns them 180° (SYM picks which for `build`).
 */
export type Sym = 'mirror' | 'turn';
const SYM: Sym = process.env.SYM === 'turn' ? 'turn' : 'mirror';
/**
 * STRIP=0: fully symmetric black tiles (no spare strip), only the ends breaking the symmetry;
 * boards can then be wider than tall too, so the mirror runs either way. Unset: a strip of 1–2 rows.
 */
const STRIP = process.env.STRIP === undefined ? null : Number(process.env.STRIP);

export function mirrorFor(w: number, h: number, strip: number, sym: Sym = SYM): Mirror {
  return (cell) => {
    const [r, c] = cellRC({ w, h }, cell);
    return r < strip ? -1 : cellAt({ w, h }, strip + h - 1 - r, sym === 'turn' ? w - 1 - c : c);
  };
}

/** The symmetry a puzzle's black tiles follow (a strip of 0–2 rows at the top left out), if any. */
export function mirrorOf(p: Puzzle, syms: Sym[] = [SYM]): { m: Mirror; strip: number } | null {
  for (const sym of syms) {
    for (const strip of [1, 2, 0]) {
      const m = mirrorFor(p.w, p.h, strip, sym);
      if (p.blocked.size && [...p.blocked].every((c) => m(c) >= 0 && p.blocked.has(m(c)))) return { m, strip };
    }
  }
  return null;
}

/** Add one mirrored pair of black tiles in the mirrored part, trying up to 20 spots. */
function addPair(p: Puzzle, m: Mirror, strip: number, rand: () => number): boolean {
  const half = Math.ceil((p.h - strip) / 2);
  for (let t = 0; t < 20; t++) {
    const c = cellAt(p, strip + Math.floor(rand() * half), Math.floor(rand() * p.w));
    const cs = [c, m(c)].filter((x) => !p.blocked.has(x));
    if (!cs.length || p.endpoints.some((e) => cs.includes(portCell(p, e.port)))) continue;
    for (const x of cs) p.blocked.add(x);
    if (openTilesOk(p)) return true;
    for (const x of cs) p.blocked.delete(x);
  }
  return false;
}

/** Put the ends somewhere on the right checkerboard colours, not making the board symmetric. */
function placeEnds(p: Puzzle, rand: () => number): boolean {
  const ports = portCount(p);
  for (let t = 0; t < 40; t++) {
    const a = Math.floor(rand() * ports);
    const b = Math.floor(rand() * ports);
    if (a === b || p.blocked.has(portCell(p, a)) || p.blocked.has(portCell(p, b)) || portCell(p, a) === portCell(p, b)) continue;
    p.endpoints = [portEnd(a), portEnd(b)];
    if (parityCheck(p).ok && !symmetryOf(p)) return true;
  }
  return false;
}

const status = (p: Puzzle) => solve(p, { maxSolutions: 2, nodeLimit: env('NODE_LIMIT', 200_000) });

/** Record a unique puzzle (main file or easy file), with its hints and path echo. */
function keep(p: Puzzle, m: Mirror, run: number, path: number[], seen: Set<string>) {
  const code = encodePuzzle(p);
  if (seen.has(code)) return;
  seen.add(code);
  const j = hintJourney(p);
  if (j.outcome !== 'solved') return;
  const on = new Set(path);
  let inside = 0;
  let echoed = 0;
  for (const e of on) {
    const [a, b] = edgeCells(p, e);
    if (m(a) < 0 || m(b) < 0) continue;
    inside++;
    if (on.has(edgeBetween(p, m(a), m(b)))) echoed++;
  }
  const echo = inside ? echoed / inside : 0;
  const file = j.steps.length >= 2 ? `${OUT}-${run}` : `${OUT}-easy-${run}`;
  record(`offset-symmetry/${file}.tsv`, [code, `${p.w}x${p.h}`, j.steps.length, echo.toFixed(2), j.steps.map((s) => s.rule + (s.area ?? '')).join(' ')].join('\t'));
}

function logger(run: number) {
  const drops: Record<string, number> = {};
  let tries = 0;
  return {
    drop: (why: string) => (drops[why] = (drops[why] ?? 0) + 1),
    tick: () => {
      if (++tries % 50 === 0) record(`offset-symmetry/${OUT}-log-${run}.txt`, `${tries} ${JSON.stringify(drops)}`);
    },
  };
}

/** Build puzzles from scratch. */
export function build(run: number, minutes = env('RESEARCH_MINUTES', 3)) {
  const rand = seededRandom(9000 + run);
  const pick = (n: number) => Math.floor(rand() * n);
  const end = Date.now() + minutes * 60_000;
  const log = logger(run);
  const seen = new Set<string>();
  while (Date.now() < end) {
    log.tick();
    const w = env('MIN_W', 6) + pick(env('MAX_W', 8) - env('MIN_W', 6) + 1);
    const minH = STRIP === null ? Math.max(w + 1, env('MIN_H', 8)) : env('MIN_H', 6);
    const h = minH + pick(Math.max(1, Math.min(2 * w, env('MAX_H', 12)) - minH + 1));
    const strip = STRIP ?? 1 + pick(2);
    const m = mirrorFor(w, h, strip);
    const p = createPuzzle(w, h);
    const pairs = 2 + pick(Math.max(2, Math.floor(w / 2)));
    for (let i = 0; i < pairs; i++) addPair(p, m, strip, rand);
    if (!p.blocked.size) {
      log.drop('no tiles');
      continue;
    }
    // Several end pairs; then, while there are still several solutions, one more pair (a few times).
    let r: ReturnType<typeof status> | null = null;
    for (let extra = 0; extra <= 4; extra++) {
      if (extra && !addPair(p, m, strip, rand)) break;
      for (let k = 0; k < 6; k++) {
        if (!placeEnds(p, rand)) break;
        r = status(p);
        if (r.status === 'unique') break;
      }
      if (!r || r.status !== 'multiple') break;
    }
    if (!r || r.status !== 'unique') {
      log.drop(r ? r.status : 'no ends');
      continue;
    }
    if (symmetryOf(p)) {
      log.drop('symmetric');
      continue;
    }
    keep(p, m, run, r.solutions[0], seen);
  }
}

/** Search around good finds (and the puzzles they came from): move one mirrored pair, or one end. */
export function mutate(run: number, minutes = env('RESEARCH_MINUTES', 3)) {
  const rand = seededRandom(9500 + run);
  const pick = (n: number) => Math.floor(rand() * n);
  const end = Date.now() + minutes * 60_000;
  const log = logger(run);
  const seen = new Set<string>();
  const minEcho = env('SEED_ECHO', 0.9);
  const seeds = () => {
    const dir = outPath('offset-symmetry');
    const found = readdirSync(dir)
      .filter((f) => new RegExp(SYM === 'mirror' && STRIP === null ? `^(${OUT}|tiles|seven|found)-\\d+\\.tsv$` : `^${OUT}-\\d+\\.tsv$`).test(f))
      .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
      .map((l) => l.split('\t'))
      .filter((x) => +x[3] >= minEcho && +x[2] >= 2)
      .map((x) => x[0]);
    // Seeds of the right symmetry only (mirror finds don't turn, and the other way round).
    if (STRIP !== null) return found;
    return [...(SYM === 'mirror' ? ['BiouuR74XSs', 'BjIpNQnoIdhA', 'BjHuORU_6YA', 'BjJnz0deFWtA'] : []), ...found];
  };
  let pool = seeds();
  while (Date.now() < end) {
    log.tick();
    if (rand() < 0.02) pool = seeds();
    if (!pool.length) {
      // Nothing found to start from yet: look again now and then.
      if (rand() < 0.0005) pool = seeds();
      continue;
    }
    let p: Puzzle;
    try {
      p = clonePuzzle(decodePuzzle(pool[pick(pool.length)]));
    } catch {
      continue;
    }
    if (p.walls.size) continue;
    const mm = mirrorOf(p);
    if (!mm || (STRIP !== null && mm.strip !== STRIP)) {
      log.drop('no mirror');
      continue;
    }
    if (rand() < 0.6) {
      // Move one mirrored pair.
      const c = [...p.blocked][pick(p.blocked.size)];
      for (const x of [c, mm.m(c)]) p.blocked.delete(x);
      if (!addPair(p, mm.m, mm.strip, rand)) {
        log.drop('no room');
        continue;
      }
    } else {
      // Move one end.
      const keepEnd = p.endpoints[pick(2)];
      const ports = portCount(p);
      let ok = false;
      for (let t = 0; t < 40 && !ok; t++) {
        const b = pick(ports);
        if (b === keepEnd.port || p.blocked.has(portCell(p, b))) continue;
        p.endpoints = [keepEnd, portEnd(b)];
        ok = parityCheck(p).ok && !symmetryOf(p);
      }
      if (!ok) {
        log.drop('no ends');
        continue;
      }
    }
    const r = status(p);
    if (r.status !== 'unique') {
      log.drop(r.status);
      continue;
    }
    if (symmetryOf(p)) {
      log.drop('symmetric');
      continue;
    }
    keep(p, mm.m, run, r.solutions[0], seen);
  }
}
