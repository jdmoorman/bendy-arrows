import { encodePuzzle } from '../../src/codec';
import { isSymmetric, openTilesOk, portFor, randomHamiltonian, seededRandom } from '../../src/generator';
import { ADVANCED_RULES, ALL_RULES, deductions, searchMetrics, type RuleId } from '../../src/logic';
import { createPuzzle, edgeBetween, edgeCells, edgeCount, isUsableEdge, type Puzzle } from '../../src/model';
import { singleStroke } from '../single-stroke/search';
import { record } from '../out';

/** The editor's "Easy rules": everything but the checkerboard rules. */
const EASY: RuleId[] = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));

/** Where the stroke is: its lines so far and the tile at its end. */
interface StrokeState {
  segments: Set<number>;
  head: number;
}

/** One forced line out of the stroke's end, if the easy rules give one. */
function nextLine(p: Puzzle, s: StrokeState): number {
  for (const d of deductions(p, { segments: s.segments, xs: new Set() }, EASY)) {
    for (const e of d.segments) {
      if (s.segments.has(e)) continue;
      const [a, b] = edgeCells(p, e);
      if (a === s.head || b === s.head) return e;
    }
  }
  return -1;
}

/** Draw every line the easy rules force out of the stroke's end, in turn. */
function advance(p: Puzzle, s: StrokeState): void {
  for (;;) {
    const e = nextLine(p, s);
    if (e < 0) return;
    const [a, b] = edgeCells(p, e);
    s.segments.add(e);
    s.head = a === s.head ? b : a;
  }
}

/**
 * A single-stroke puzzle built up wall by wall: a random path through every tile (around a few
 * black tiles) is the hidden solution; the stroke from the tail goes as far as the easy rules
 * force it, and whenever it's stuck, a random wall the path doesn't cross is added that lets it
 * go on. Every line is forced, so the solution is unique; nothing is simplified afterwards.
 */
export function strokePuzzle(w: number, h: number, seed: number, blackDensity: number, greedy = false): Puzzle | null {
  const rand = seededRandom(seed);
  const p = createPuzzle(w, h);
  const cells = w * h;
  for (let tries = 0, want = Math.round(cells * blackDensity); p.blocked.size < want && tries < cells * 4; tries++) {
    const c = Math.floor(rand() * cells);
    if (p.blocked.has(c)) continue;
    p.blocked.add(c);
    if (!openTilesOk(p)) p.blocked.delete(c);
  }
  const order = randomHamiltonian(p, rand);
  if (!order) return null;
  p.endpoints = [portFor(p, order[0], rand), portFor(p, order[order.length - 1], rand)];
  const path = new Set(order.slice(1).map((c, i) => edgeBetween(p, order[i], c)));
  const s: StrokeState = { segments: new Set(), head: order[0] };
  for (let guard = 0; guard < cells * 2; guard++) {
    advance(p, s);
    if (s.segments.size === order.length - 1) break;
    // Stuck: walls the hidden path doesn't cross, in random order; keep the first that frees the stroke.
    const spare = [...Array(edgeCount(p)).keys()].filter((e) => isUsableEdge(p, e) && !path.has(e));
    for (let i = spare.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [spare[i], spare[j]] = [spare[j], spare[i]];
    }
    // Random: the first wall that frees the stroke. Greedy: of those, the one it then runs furthest
    // with (fewer walls in all); ties go to the first in the random order.
    let wall: number | undefined;
    let best = -1;
    for (const e of spare) {
      p.walls.add(e);
      if (nextLine(p, s) >= 0) {
        if (!greedy) {
          p.walls.delete(e);
          wall = e;
          break;
        }
        const t: StrokeState = { segments: new Set(s.segments), head: s.head };
        advance(p, t);
        if (t.segments.size > best) {
          best = t.segments.size;
          wall = e;
        }
      }
      p.walls.delete(e);
    }
    if (wall === undefined) return null;
    p.walls.add(wall);
  }
  if (s.segments.size !== order.length - 1) return null;
  // Every wall was checked from where the stroke was stuck: check the whole stroke afresh.
  if (!singleStroke(p)) return null;
  // Prune: a wall added early may have been made unneeded by later ones. Take each away (in
  // random order) and keep it away only if the whole puzzle still draws in one stroke. (Unlike
  // plain simplifying, which keeps just uniqueness, this re-checks the stroke every time.)
  const walls = [...p.walls];
  for (let i = walls.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [walls[i], walls[j]] = [walls[j], walls[i]];
  }
  for (const e of walls) {
    p.walls.delete(e);
    if (!singleStroke(p)) p.walls.add(e);
  }
  if (isSymmetric(p)) return null;
  return p;
}

/** Tall boards of 40 to 81 tiles, at most twice as tall as wide. */
const SIZES: [number, number][] = [];
for (let w = 5; w <= 9; w++) for (let h = w; h <= 2 * w; h++) if (w * h >= 40 && w * h <= 81) SIZES.push([w, h]);

/** Build puzzles of many tall sizes for RESEARCH_MINUTES (default 5), writing each as it's made. */
export function strokeGen(run: number): void {
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 5) * 60 * 1000;
  // SEED_OFFSET lets a later run carry on past the seeds an earlier one already tried.
  for (let seed = run * 1_000_000 + Number(process.env.SEED_OFFSET ?? 0); Date.now() < end; seed++) {
    // 40 to 81 tiles, at most twice as tall as wide: 5×8 up to 9×9.
    const [w, h] = SIZES[seed % SIZES.length];
    // WALLS_ONLY=1: no black tiles at all.
    const black = process.env.WALLS_ONLY ? 0 : [0, 0, 0.03, 0.06][(seed >> 5) % 4];
    // Mostly greedy (sparser); some random for variety.
    const greedy = (seed >> 7) % 4 !== 0;
    const p = strokePuzzle(w, h, seed, black, greedy);
    if (!p) continue;
    const s = singleStroke(p)!;
    const m = searchMetrics(p);
    record(
      `stroke-gen/${w}x${h}.txt`,
      `Built stroke ${w}×${h} · ${String(s.decisions).padStart(2, '0')} decisions · ${String(p.walls.size).padStart(2, '0')} walls · ${p.blocked.size} black · crux ${Math.round(m.tightest)} · ${greedy ? 'greedy' : 'random'} (seed ${seed}) — #p=${encodePuzzle(p)}`,
    );
  }
}
