import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { PACKS } from '../../src/levels';
import { hintJourney } from '../../src/logic';
import { cellAt, cellRC, edgeBetween, edgeCells, levelKey, neighbors, orientTail, transformPuzzle, type Puzzle, type Transform } from '../../src/model';
import { solve } from '../../src/solver';
import { outPath, record } from '../out';
import { mirrorOf as symOf } from './tiles';

// Picks COUNT offset-symmetry finds for a level pack, by looks:
//   board: not crowded, few walls, black tiles in blocks a small plus;
//   path: mostly mirrored (path echo); corners in a band (about one per two lines) cost nothing,
//   too many (a tight zigzag) or too few (nearly all straight stretches) cost more the further out;
//   solving: at least three hints.
// Different puzzles only (and none a pack has already), spread over sizes, then listed by hints.
// Each is turned upright with its tail low on the left, as pack levels are.
// Output: offset-symmetry/pick.txt (code, then the facts).

const COUNT = Number(process.env.COUNT ?? 50);

/** The symmetry the black tiles follow (mirrored or turned 180°, below a spare strip), as a cell map. */
function mirrorOf(p: Puzzle) {
  return symOf(p, ['mirror', 'turn'])?.m ?? null;
}

/** A board's black tiles, size and ends, for telling cousins apart. */
type Board = { blocked: Set<number>; size: string; ends: string };
const boardOf = (q: Puzzle): Board => ({ blocked: q.blocked, size: `${q.w}x${q.h}`, ends: q.endpoints.map((e) => e.port).sort().join() });
/** A board every way round: as it is, then turned and mirrored. */
const TURNS: Transform[][] = [[], ['rotateRight'], ['rotateRight', 'rotateRight'], ['rotateLeft'], ['flipH'], ['flipV'], ['rotateRight', 'flipH'], ['rotateLeft', 'flipH']];
const turnsOf = (q: Puzzle) => TURNS.map((ts) => boardOf(ts.reduce((x, t) => transformPuzzle(x, t), q)));

/**
 * Corners per line of the path: no cost inside CORNERS_LOW..CORNERS_HIGH, a growing cost outside it
 * either way (a tight zigzag, or a path that's nearly all straight stretches).
 */
const cornerCost = (rate: number) => Math.max(0, rate - Number(process.env.CORNERS_HIGH ?? 0.62), Number(process.env.CORNERS_LOW ?? 0.52) - rate);

/** Share of the path's lines that run across: no cost in DIR_LOW..DIR_HIGH, a growing cost outside (mostly up and down, or mostly across). */
const dirCost = (share: number) => Math.max(0, share - Number(process.env.DIR_HIGH ?? 0.62), Number(process.env.DIR_LOW ?? 0.38) - share);

test('pick offset symmetry', () => {
  const dir = outPath('offset-symmetry');
  const codes = new Set(
    readdirSync(dir)
      .filter((f) => new RegExp(`^(${process.env.FROM ?? 'found'})-\\d+\\.tsv$`).test(f))
      .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n'))
      .map((l) => l.split('\t')[0]),
  );
  // SKIP_PACK: a pack (e.g. the one being redone) whose levels don't count as taken.
  const packs = PACKS.filter((k) => k.name !== process.env.SKIP_PACK);
  const taken = new Set(packs.flatMap((k) => k.levels).map((c) => levelKey(decodePuzzle(c))));
  const cands: { code: string; size: string; hints: number; score: number; facts: string; turns: Board[] }[] = [];
  for (const code of codes) {
    let p: Puzzle;
    try {
      p = decodePuzzle(code);
    } catch {
      continue; // a line still being written by a running search
    }
    // Big enough: at least MIN_W by MIN_H (either way round).
    const [short, long] = [Math.min(p.w, p.h), Math.max(p.w, p.h)];
    if (short < Number(process.env.MIN_W ?? 0) || long < Number(process.env.MIN_H ?? 0)) continue;
    const key = levelKey(p);
    if (taken.has(key) && !process.env.ANY_PACK) continue;
    // The mirror runs across the rows with the spare strip at the top; a puzzle already turned
    // as a pack level may have it at the bottom or across the columns, so try those ways too.
    let m = mirrorOf(p);
    for (const ts of [['flipV'], ['rotateRight'], ['rotateLeft']] as Transform[][]) {
      if (m) break;
      const t = ts.reduce((x, k) => transformPuzzle(x, k), p);
      const tm = mirrorOf(t);
      if (tm) {
        p = t;
        m = tm;
      }
    }
    if (!m) continue;
    // Board looks.
    // Black tiles that touch are liked a little: side by side counts fully, corner to corner half.
    // Worth up to TOUCH_WEIGHT points for the share of black tiles that touch, so it never pays to
    // add tiles (crowding costs more).
    const diagonal = (c: number) => {
      const [r, col] = cellRC(p, c);
      return [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => {
        const rr = r + dr;
        const cc = col + dc;
        return rr >= 0 && cc >= 0 && rr < p.h && cc < p.w && p.blocked.has(cellAt(p, rr, cc));
      });
    };
    const touching = [...p.blocked].reduce((sum, c) => sum + (neighbors(p, c).some((n) => p.blocked.has(n)) ? 1 : diagonal(c) ? 0.5 : 0), 0);
    if (p.walls.size > Number(process.env.MAX_WALLS ?? 4)) continue;
    const density = (p.blocked.size + p.walls.size) / (p.w * p.h);
    if (density > Number(process.env.MAX_DENSITY ?? 0.2)) continue;
    const r = solve(p, { maxSolutions: 2 });
    if (r.status !== 'unique') continue;
    const j = hintJourney(p);
    if (j.outcome !== 'solved' || j.steps.length < 3) continue;
    // Path looks: echo, and the average straight run (in lines) between turns.
    const path = new Set(r.solutions[0]);
    let inside = 0;
    let echoed = 0;
    for (const e of path) {
      const [a, b] = edgeCells(p, e);
      if (m(a) < 0 || m(b) < 0) continue;
      inside++;
      if (path.has(edgeBetween(p, m(a), m(b)))) echoed++;
    }
    const echo = echoed / inside;
    // Lines running across (between tiles side by side) as against up and down.
    const horizontal = [...path].filter((e) => {
      const [a, b] = edgeCells(p, e);
      return b === a + 1;
    }).length;
    let turns = 0;
    for (let c = 0; c < p.w * p.h; c++) {
      const ns = neighbors(p, c).filter((n) => path.has(edgeBetween(p, c, n)));
      if (ns.length === 2 && cellRC(p, ns[0])[0] !== cellRC(p, ns[1])[0] && cellRC(p, ns[0])[1] !== cellRC(p, ns[1])[1]) turns++;
    }
    const run = path.size / (turns + 1);
    const score = Math.min(j.steps.length, 8) + Number(process.env.ECHO_WEIGHT ?? 12) * echo - Number(process.env.CORNER_WEIGHT ?? 20) * cornerCost(turns / path.size) - Number(process.env.DIR_WEIGHT ?? 0) * dirCost(horizontal / path.size) - 10 * density - 0.5 * p.walls.size + Number(process.env.TOUCH_WEIGHT ?? 1.5) * (p.blocked.size ? touching / p.blocked.size : 0);
    let q = p.w > p.h ? transformPuzzle(p, 'rotateRight') : p;
    q = orientTail(q);
    taken.add(key);
    cands.push({
      code: encodePuzzle(q),
      turns: turnsOf(q),
      size: `${q.w}x${q.h}`,
      hints: j.steps.length,
      score,
      facts: `${q.w}×${q.h} · ${j.steps.length} hints (${j.steps.map((s) => s.area).join(' ')}) · echo ${echo.toFixed(2)} · corners ${(turns / path.size).toFixed(2)} · across ${(horizontal / path.size).toFixed(2)} · ${p.blocked.size} black ${p.walls.size} walls · score ${score.toFixed(1)}`,
    });
  }
  // Families of cousins: the same board with a pair or two of black tiles moved, or its ends moved
  // (as the search around good finds makes them), joined up so a cousin of a cousin is family too.
  // Compared every way round (turned and mirrored), so the same board lines up however it was found.
  type Cand = { turns: Board[] };
  const diff = (a: Board, b: Board) => [...a.blocked].filter((x) => !b.blocked.has(x)).length + [...b.blocked].filter((x) => !a.blocked.has(x)).length;
  const shared = (a: Board, b: Board) => [...a.blocked].filter((x) => b.blocked.has(x)).length;
  // Cousins share most of their black tiles (so two sparse boards aren't joined just for being sparse).
  const near = (a: Board, b: Board) =>
    a.size === b.size && shared(a, b) >= Math.max(a.blocked.size, b.blocked.size) / 2 && (diff(a, b) <= Number(process.env.COUSIN ?? 4) || (a.ends === b.ends && diff(a, b) <= 8));
  const cousin = (a: Cand, b: Cand) => b.turns.some((t) => near(a.turns[0], t));
  // (ANY_PACK: ignore the packs, e.g. to count every family.)
  // Levels in packs, and ones looked at and turned down (rejected.txt): no family of theirs is offered.
  const rejected = readFileSync(new URL('./rejected.txt', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const packed: Cand[] = (process.env.ANY_PACK ? [] : [...packs.flatMap((k) => k.levels), ...rejected]).flatMap((c) => {
    const q = decodePuzzle(c);
    // Only black-tile levels can be family.
    if (q.walls.size || !q.blocked.size) return [];
    return [{ turns: turnsOf(q) }];
  });
  const all: Cand[] = [...cands, ...packed];
  const parent = all.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) if (cousin(all[a], all[b])) parent[root(a)] = root(b);
  // Only the best of each family, and no family with a level already in a pack.
  const inPack = new Set(packed.map((_, i) => root(cands.length + i)));
  const best = new Map<number, (typeof cands)[0]>();
  cands.forEach((c, i) => {
    const r = root(i);
    if (inPack.has(r)) return;
    if (!best.has(r) || best.get(r)!.score < c.score) best.set(r, c);
  });
  const families = [...best.values()].sort((a, b) => b.score - a.score);
  // Best first, taking turns between sizes so the pack isn't all one size.
  const bySize = new Map<string, typeof cands>();
  for (const c of families) bySize.set(c.size, [...(bySize.get(c.size) ?? []), c]);
  const picks: typeof cands = [];
  while (picks.length < COUNT && [...bySize.values()].some((l) => l.length)) {
    for (const l of [...bySize.values()].sort((a, b) => (b[0]?.score ?? -99) - (a[0]?.score ?? -99))) {
      const c = l.shift();
      if (c && picks.length < COUNT) picks.push(c);
    }
  }
  record('offset-symmetry/pick.txt', `# ${cands.length} candidates, ${families.length} families not in a pack`);
  for (const c of picks.sort((a, b) => a.hints - b.hints || a.code.length - b.code.length)) record('offset-symmetry/pick.txt', `${c.code}\t${c.facts}`);
});
