import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { encodePuzzle } from '../../src/codec';
import { openTilesOk, portFor, randomHamiltonian, seededRandom } from '../../src/generator';
import { ADVANCED_RULES, ALL_RULES, findStrokeHint, runLogic, runStroke, strokeFrom, STROKE_HINT_ORDER, type LogicState } from '../../src/logic';
import { cellAt, clonePuzzle, createPuzzle, edgeCount, isUsableEdge, openCells, orientTail, portCell, portCount, portEnd, type Puzzle } from '../../src/model';
import { solve } from '../../src/solver';
import { symmetryOf } from '../../src/symmetry';
import { outPath, record } from '../out';

// Large one-shots with black tiles only, whose stroke can be finished with hints that never
// hand the player X marks from the checkerboard rules: a Checkerboard balance (or imbalance)
// hint may draw lines, but a hint that's only its X marks doesn't count, and the level is
// left out if it needs one.
//
// Built as the earlier big-strokes search did: a few black tiles in pairs (one of each
// checkerboard colour, none cutting the board up or leaving a dead end), ends from a random path
// through the rest, then a climb (moving a tile, adding or taking away a pair, moving an end,
// with now and then a step back) towards boards the rules decide more of, until the solver
// finds just one solution; then as few black tiles as keep it unique.
// Env: RUN (seed), MINUTES (480), MIN, MAX (the short side, 9 to 11; the long side up to 2 more),
// TILES (black tiles to start with, as a share of the board, 0.06), CLIMB_SECONDS (90), CHECK_AT (20).
// Output: xl-strokes/found-<RUN>.tsv: code, size, open tiles, black tiles, hints, hint rules;
// xl-strokes/log-<RUN>.txt: how tries ended.

const env = (k: string, d: number) => Number(process.env[k] ?? d);
const RUN = env('RUN', 1);
const EASY = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));
const CHECKERBOARD = new Set(['balance', 'imbalance']);

const status = (p: Puzzle) => solve(p, { maxSolutions: 2, nodeLimit: 300_000 });

/** The stroke as a player with hints draws it, refusing checkerboard X-mark hints: its hint rules, or null if it can't be finished. */
function journey(p: Puzzle): string[] | null {
  let state: LogicState = { segments: new Set(), xs: new Set() };
  const rules: string[] = [];
  for (let i = 0; i <= 2 * edgeCount(p); i++) {
    const run = runStroke(p, EASY, state);
    state = run.state;
    if (run.solved) return rules;
    if (run.contradiction) return null;
    const { tiles, lines } = strokeFrom(p, state.segments);
    const h = findStrokeHint(p, lines, tiles[tiles.length - 1], {}, STROKE_HINT_ORDER, state.xs);
    if (h.kind === 'solved') return rules;
    if (h.kind !== 'deduction') return null;
    const d = h.deduction;
    if (CHECKERBOARD.has(d.rule) && !d.segments.length) return null;
    rules.push(d.rule + (d.cells ? d.cells.length : ''));
    state = { segments: new Set([...lines, ...d.segments]), xs: new Set([...state.xs, ...d.xs]) };
  }
  return null;
}

test('xl tile strokes', () => {
  const rand = seededRandom(47_000 + RUN);
  const pick = (n: number) => Math.floor(rand() * n);
  const end = Date.now() + env('MINUTES', 480) * 60_000;
  const seen = new Set<string>();
  const odd = (p: Puzzle, c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
  const addOne = (p: Puzzle, colour: boolean) => {
    for (let t = 0; t < 30; t++) {
      const c = cellAt(p, pick(p.h), pick(p.w));
      if (p.blocked.has(c) || odd(p, c) !== colour) continue;
      p.blocked.add(c);
      if (openTilesOk(p)) return c;
      p.blocked.delete(c);
    }
    return -1;
  };
  const addPair = (p: Puzzle) => {
    const a = addOne(p, true);
    if (a < 0) return false;
    if (addOne(p, false) >= 0) return true;
    p.blocked.delete(a);
    return false;
  };
  // Borders the rules leave undecided (+1), 1 when they decide all, 0 for a contradiction.
  const count = (p: Puzzle) => {
    const r = runLogic(p, ALL_RULES);
    if (r.contradiction) return 0;
    let n = 0;
    for (let e = 0; e < edgeCount(p); e++) if (isUsableEdge(p, e) && !r.state.segments.has(e) && !r.state.xs.has(e)) n++;
    return n + 1;
  };
  const drops: Record<string, number> = {};
  const drop = (k: string) => {
    drops[k] = (drops[k] ?? 0) + 1;
    writeFileSync(outPath(`xl-strokes/log-${RUN}.txt`), JSON.stringify(drops));
  };
  while (Date.now() < end) {
    const w = env('MIN', 9) + pick(env('MAX', 11) - env('MIN', 9) + 1);
    const h = w + pick(3);
    const p = createPuzzle(w, h);
    const pairs = Math.max(1, Math.round((env('TILES', 0.06) * w * h * (0.5 + rand())) / 2));
    for (let i = 0; i < pairs; i++) addPair(p);
    const order = randomHamiltonian(p, rand);
    if (!order) {
      drop('no path');
      continue;
    }
    p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
    const score = (n: number, q: Puzzle) => n + 0.5 * q.blocked.size;
    let n = count(p);
    const climb = env('CLIMB_SECONDS', 90) * 1000;
    const until = Date.now() + climb;
    const done = () => n === 1 || (n <= 1 + env('CHECK_AT', 20) && status(p).status === 'unique');
    while (!done() && Date.now() < until) {
      const q = clonePuzzle(p);
      const k = pick(4);
      const tiles = [...q.blocked];
      if (k === 0 && tiles.length) {
        const c = tiles[pick(tiles.length)];
        q.blocked.delete(c);
        if (addOne(q, odd(q, c)) < 0) continue;
      } else if (k === 1) {
        if (!addPair(q)) continue;
      } else if (k === 2 && tiles.length >= 2) {
        const a = tiles[pick(tiles.length)];
        const others = tiles.filter((c) => odd(q, c) !== odd(q, a));
        if (!others.length) continue;
        q.blocked.delete(a);
        q.blocked.delete(others[pick(others.length)]);
        if (!openTilesOk(q)) continue;
      } else {
        const i = pick(2);
        const cell = portCell(q, q.endpoints[i].port);
        const port = pick(portCount(q));
        const to = portCell(q, port);
        if (q.blocked.has(to) || odd(q, to) !== odd(q, cell) || q.endpoints.some((e) => e.port === port)) continue;
        q.endpoints[i] = portEnd(port);
      }
      if (q.endpoints.some((e) => q.blocked.has(portCell(q, e.port)))) continue;
      const m = count(q);
      const heat = Math.max(0.05, (until - Date.now()) / climb);
      if (m === 0 || (score(m, q) > score(n, p) && rand() > Math.exp((score(n, p) - score(m, q)) / heat))) continue;
      p.blocked = q.blocked;
      p.endpoints = q.endpoints;
      n = m;
    }
    if (!done()) {
      drop('not unique');
      continue;
    }
    // As few black tiles as keep it unique.
    for (const c of [...p.blocked].sort(() => rand() - 0.5)) {
      p.blocked.delete(c);
      if (!openTilesOk(p) || status(p).status !== 'unique') p.blocked.add(c);
    }
    if (status(p).status !== 'unique' || symmetryOf(p)) {
      drop('lost uniqueness');
      continue;
    }
    const q = orientTail({ ...p, oneShot: true });
    const code = encodePuzzle(q);
    if (seen.has(code)) continue;
    seen.add(code);
    const rules = journey(q);
    if (!rules) {
      drop('needs checkerboard Xs or stuck');
      continue;
    }
    drop('kept');
    record(`xl-strokes/found-${RUN}.tsv`, [code, `${q.w}x${q.h}`, openCells(q).length, q.blocked.size, rules.length, rules.join(' ')].join('\t'));
  }
});
