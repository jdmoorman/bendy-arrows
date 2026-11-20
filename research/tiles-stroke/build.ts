import { encodePuzzle } from '../../src/codec';
import { portFor, seededRandom } from '../../src/generator';
import { ADVANCED_RULES, ALL_RULES, deductions, type RuleId } from '../../src/logic';
import { cellRC, createPuzzle, edgeCells, neighbors, openCells, portCell, transformPuzzle, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { singleStroke } from '../single-stroke/search';
import { record } from '../out';

/**
 * Single strokes with black tiles only (no walls), built without a hidden path: the stroke
 * from the tail goes as far as the rules force it; when it's stuck, a black tile (with the
 * exit moved, to keep the checkerboard parity possible) or a pair of black tiles (one of
 * each colour) is added that lets it go on, as long as the solver can still finish.
 */

const EASY: RuleId[] = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));

/** What a board aims for: easy rules only; any rule; or preferring steps that need the advanced rules. */
export type Aim = 'easy' | 'mixed' | 'hard';

interface Stroke {
  segments: Set<number>;
  head: number;
  visited: Set<number>;
  /** Steps that needed more than the easy rules. */
  hard: number;
}

const shaded = (p: Puzzle, c: number) => {
  const [r, col] = cellRC(p, c);
  return (r + col) % 2 === 1;
};

const onFrame = (p: Puzzle, c: number) => {
  const [r, col] = cellRC(p, c);
  return r === 0 || col === 0 || r === p.h - 1 || col === p.w - 1;
};

/** The next line forced at the stroke's head: easy rules first, then (unless the aim is easy) all. */
function nextLine(p: Puzzle, s: Stroke, aim: Aim): { edge: number; hard: boolean } | null {
  const sets: [RuleId[], boolean][] = aim === 'easy' ? [[EASY, false]] : [[EASY, false], [ALL_RULES, true]];
  for (const [rules, hard] of sets) {
    for (const d of deductions(p, { segments: s.segments, xs: new Set() }, rules)) {
      for (const e of d.segments) {
        if (s.segments.has(e)) continue;
        const [a, b] = edgeCells(p, e);
        if (a === s.head || b === s.head) return { edge: e, hard };
      }
    }
  }
  return null;
}

/** Draw every forced line in turn; false if the stroke runs into itself. */
function advance(p: Puzzle, s: Stroke, aim: Aim, deadline: number): boolean {
  while (Date.now() < deadline) {
    const f = nextLine(p, s, aim);
    if (!f) return true;
    const [a, b] = edgeCells(p, f.edge);
    const to = a === s.head ? b : a;
    if (s.visited.has(to) || p.blocked.has(to)) return false;
    s.segments.add(f.edge);
    s.visited.add(to);
    s.head = to;
    if (f.hard) s.hard++;
  }
  return true;
}

const copy = (s: Stroke): Stroke => ({ segments: new Set(s.segments), head: s.head, visited: new Set(s.visited), hard: s.hard });

/** The colour the exit must have so a path through every open tile can start at the tail; null if none can. */
function exitColour(p: Puzzle, tail: number): boolean | null {
  let diff = 0;
  for (const c of openCells(p)) diff += shaded(p, c) ? 1 : -1;
  const t = shaded(p, tail);
  if (diff === 0) return !t;
  if (diff === 1) return t ? true : null;
  if (diff === -1) return !t ? false : null;
  return null;
}

/** The tiles not yet on the stroke (plus its head) are still all connected. */
function connected(p: Puzzle, s: Stroke): boolean {
  const left = openCells(p).filter((c) => !s.visited.has(c) || c === s.head);
  const inLeft = new Set(left);
  const seen = new Set([s.head]);
  const queue = [s.head];
  while (queue.length) {
    const c = queue.pop()!;
    for (const m of neighbors(p, c)) {
      if (inLeft.has(m) && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen.size === left.length;
}

function shuffle<T>(rand: () => number, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Why a build stopped (for the log). */
export type Outcome = 'ok' | 'stuck' | 'time' | 'recheck' | 'start';

/** How many workable candidates to look at fully (run the stroke on) at each stuck point. */
const EVALUATE = 30;

export function build(w: number, h: number, seed: number, aim: Aim, minutes = 10): { p?: Puzzle; outcome: Outcome; tiles: number } {
  const rand = seededRandom(seed);
  const deadline = Date.now() + minutes * 60 * 1000;
  const p = createPuzzle(w, h);
  const nodeLimit = w * h > 64 ? 20_000 : 50_000;
  const frame = shuffle(rand, [...Array(w * h).keys()].filter((c) => onFrame(p, c)));
  // On an odd board both ends sit on the commoner colour.
  const tail = frame.find((c) => exitColour(p, c) !== null)!;
  const want = exitColour(p, tail);
  const exit0 = frame.find((c) => c !== tail && shaded(p, c) === want);
  if (exit0 === undefined) return { outcome: 'start', tiles: 0 };
  p.endpoints = [portFor(p, tail, rand), portFor(p, exit0, rand)];
  const s: Stroke = { segments: new Set(), head: tail, visited: new Set([tail]), hard: 0 };
  const total = () => openCells(p).length;
  const exitTile = () => portCell(p, p.endpoints[1].port);

  for (let guard = 0; guard < 2 * w * h; guard++) {
    if (!advance(p, s, aim, deadline)) return { outcome: 'stuck', tiles: s.visited.size };
    if (Date.now() > deadline) return { outcome: 'time', tiles: s.visited.size };
    if (s.visited.size === total()) break;

    // Candidates: one black tile with the exit moved, or an opposite-coloured pair with it kept.
    const free = openCells(p).filter((c) => !s.visited.has(c));
    type Cand = { black: number[]; exit?: number };
    const cands: Cand[] = [];
    for (const c of free) {
      if (c === exitTile()) continue;
      p.blocked.add(c);
      const col = exitColour(p, tail);
      p.blocked.delete(c);
      if (col === null) continue;
      const exits = shuffle(rand, free.filter((e) => e !== c && onFrame(p, e) && shaded(p, e) === col)).slice(0, 8);
      for (const e of exits) cands.push({ black: [c], exit: e });
    }
    const sh = free.filter((c) => shaded(p, c) && c !== exitTile());
    const wh = free.filter((c) => !shaded(p, c) && c !== exitTile());
    for (let i = 0; i < 300 && sh.length && wh.length; i++) {
      cands.push({ black: [sh[Math.floor(rand() * sh.length)], wh[Math.floor(rand() * wh.length)]] });
    }
    shuffle(rand, cands);

    let best: { cand: Cand; end: number; score: number; exitEnd: Puzzle['endpoints'][number] } | null = null;
    let evaluated = 0;
    const tried = new Set<string>();
    for (const cand of cands) {
      if (evaluated >= EVALUATE || Date.now() > deadline) break;
      const key = `${[...cand.black].sort((a, b) => a - b).join(',')}>${cand.exit ?? ''}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const oldExit = p.endpoints[1];
      for (const c of cand.black) p.blocked.add(c);
      if (cand.exit !== undefined) p.endpoints[1] = portFor(p, cand.exit, rand);
      const newExit = p.endpoints[1];
      let ok = connected(p, s) && nextLine(p, s, aim) !== null;
      if (ok) ok = solve(p, { mustUse: s.segments, maxSolutions: 1, nodeLimit }).solutions.length > 0;
      if (ok) {
        evaluated++;
        const t = copy(s);
        const fine = advance(p, t, aim, deadline);
        if (fine) {
          // Hard aim: each hard step is worth a few tiles of progress.
          const score = t.visited.size + (aim === 'hard' ? 3 * (t.hard - s.hard) : 0) - (cand.black.length - 1) * 0.5 + rand() * 0.1;
          if (!best || score > best.score) best = { cand, end: t.visited.size, score, exitEnd: newExit };
        }
      }
      for (const c of cand.black) p.blocked.delete(c);
      p.endpoints[1] = oldExit;
    }
    if (!best) return { outcome: 'stuck', tiles: s.visited.size };
    for (const c of best.cand.black) p.blocked.add(c);
    p.endpoints[1] = best.exitEnd;
  }
  if (s.visited.size !== total() || s.head !== exitTile()) return { outcome: 'stuck', tiles: s.visited.size };

  // The exit may have moved and tiles been added since early steps: check the whole stroke afresh.
  const fits = (q: Puzzle) => {
    const r = singleStroke(q, aim !== 'easy');
    return r ? r.hard : -1;
  };
  let hard = fits(p);
  if (hard < 0) return { outcome: 'recheck', tiles: s.visited.size };
  // Prune black tiles (alone, then opposite-coloured pairs) the stroke doesn't need, keeping
  // at least as many hard steps.
  const keep = (q: Puzzle) => {
    const k = fits(q);
    if (k < 0 || (aim === 'hard' && k < hard)) return false;
    hard = k;
    return true;
  };
  for (const c of shuffle(rand, [...p.blocked])) {
    p.blocked.delete(c);
    if (!keep(p)) p.blocked.add(c);
  }
  const blacks = shuffle(rand, [...p.blocked]);
  for (let i = 0; i < blacks.length; i++) {
    for (let j = i + 1; j < blacks.length; j++) {
      const [a, b] = [blacks[i], blacks[j]];
      if (!p.blocked.has(a) || !p.blocked.has(b) || shaded(p, a) === shaded(p, b)) continue;
      p.blocked.delete(a);
      p.blocked.delete(b);
      if (!keep(p)) p.blocked.add(a).add(b);
    }
  }
  return { p: p.w > p.h ? transformPuzzle(p, 'rotateRight') : p, outcome: 'ok', tiles: s.visited.size };
}

/** Tall boards of 25 to 100 tiles, at most twice as tall as wide. */
const SIZES: [number, number][] = [];
for (let w = 5; w <= 10; w++) for (let h = w; h <= 2 * w && w * h <= 100; h++) SIZES.push([w, h]);
const MID = SIZES.filter(([w, h]) => w * h >= 36 && w * h <= 64);
const EDGE = SIZES.filter(([w, h]) => w * h < 36 || w * h > 64);
const AIMS: Aim[] = ['easy', 'mixed', 'hard'];

/** Build boards for RESEARCH_MINUTES (default 5), writing each one as it's made. */
export function tilesGen(run: number): void {
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 5) * 60 * 1000;
  const tally: Record<string, number> = {};
  let n = 0;
  for (let seed = run * 1_000_000 + Number(process.env.SEED_OFFSET ?? 0); Date.now() < end; seed++) {
    const group = seed % 3 === 2 ? EDGE : MID;
    const [w, h] = group[Math.floor(seed / 3) % group.length];
    const aim = AIMS[Math.floor(seed / 7) % 3];
    const minutes = Math.min(10, (end - Date.now()) / 60000);
    const r = build(w, h, seed, aim, minutes);
    const k = `${aim} ${r.outcome}`;
    tally[k] = (tally[k] ?? 0) + 1;
    if (r.p) {
      const s = singleStroke(r.p, true)!;
      record(`tiles-stroke/build-${r.p.w}x${r.p.h}.txt`, `Tile stroke ${r.p.w}×${r.p.h} · ${s.hard} hard — #p=${encodePuzzle(r.p)}`);
    } else {
      record('tiles-stroke/build-fails.txt', `run ${run} seed ${seed} ${w}×${h} ${aim}: ${r.outcome} at ${r.tiles}/${w * h}`);
    }
    if (++n % 20 === 0) record('tiles-stroke/build-log.txt', `run ${run} after ${n} boards: ${JSON.stringify(tally)}`);
  }
  record('tiles-stroke/build-log.txt', `run ${run} done, ${n} boards: ${JSON.stringify(tally)}`);
}
