import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePuzzle, encodePuzzle } from '../../src/codec';
import { generate, obstacleCount, type ClueKind } from '../../src/generator';
import { ADVANCED_RULES, ALL_RULES, deductions, searchMetrics, type RuleId } from '../../src/logic';
import { edgeBetween, edgeCells, neighbors, openCells, portCell, transformPuzzle, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

/** The editor's "Easy rules": everything but Bottlenecks and Checkerboard balance. */
const EASY: RuleId[] = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));

export interface Stroke {
  /** Steps where the stroke's end had more than one way on, and the rules still picked one. */
  decisions: number;
  /** Which rules forced those decisions. */
  rules: Partial<Record<RuleId, number>>;
  /** Steps the easy rules couldn't force, so all the rules (what a hint uses) were needed. */
  hard: number;
}

/** The next line the rules force at the stroke's end, if any. */
function forcedAt(p: Puzzle, segments: Set<number>, head: number, rules: RuleId[]): { edge: number; rule: RuleId } | null {
  for (const d of deductions(p, { segments, xs: new Set() }, rules)) {
    for (const e of d.segments) {
      if (segments.has(e)) continue;
      const [a, b] = edgeCells(p, e);
      if (a === head || b === head) return { edge: e, rule: d.rule };
    }
  }
  return null;
}

/**
 * Whether the puzzle can be drawn in one stroke from the tail (the entrance) to the head, each
 * line forced by the easy rules applied to nothing but the stroke so far. Null if not.
 * With `fallback`, a step the easy rules can't force may use all the rules instead (counted
 * as `hard`).
 */
export function singleStroke(p: Puzzle, fallback = false): Stroke | null {
  if (p.endpoints.length !== 2) return null;
  const exit = portCell(p, p.endpoints[1].port);
  let head = portCell(p, p.endpoints[0].port);
  const segments = new Set<number>();
  const visited = new Set([head]);
  const total = openCells(p).length;
  const out: Stroke = { decisions: 0, rules: {}, hard: 0 };
  while (visited.size < total) {
    let f = forcedAt(p, segments, head, EASY);
    if (!f && fallback) {
      f = forcedAt(p, segments, head, ALL_RULES);
      if (f) out.hard++;
    }
    if (!f) return null;
    const next = f.edge;
    const rule = f.rule;
    // How many ways on the stroke's end had: free neighbours not yet visited, through no wall.
    const ways = neighbors(p, head).filter((c) => !visited.has(c) && !p.blocked.has(c) && !p.walls.has(edgeBetween(p, head, c))).length;
    if (ways > 1) {
      out.decisions++;
      out.rules[rule] = (out.rules[rule] ?? 0) + 1;
    }
    const [a, b] = edgeCells(p, next);
    head = a === head ? b : a;
    if (visited.has(head)) return null;
    segments.add(next);
    visited.add(head);
  }
  return head === exit ? out : null;
}

/** Turned tall (phones are held upright). */
const tall = (p: Puzzle) => (p.w > p.h ? transformPuzzle(p, 'rotateRight') : p);

export const LIST = 'single-stroke/levels.txt';
const seen = new Set<string>();

function consider(p: Puzzle, source: string) {
  const q = tall(p);
  const code = encodePuzzle(q);
  if (seen.has(code)) return;
  seen.add(code);
  const s = singleStroke(q);
  if (!s) return;
  const m = searchMetrics(q);
  const rules = Object.entries(s.rules).map(([r, n]) => `${r} ${n}`).join(', ') || 'none';
  record(
    LIST,
    `Stroke ${q.w}×${q.h} · ${String(s.decisions).padStart(2, '0')} decisions · ${String(obstacleCount(q)).padStart(2, '0')} obstacles · crux ${Math.round(m.tightest)} · ${source} (${rules}) — #p=${code}`,
  );
}

/** Puzzles already on hand: the research lists in research/out. */
export function existing(): void {
  for (const f of ['one-obstacle-levels.txt', 'chunks/10-k5/easy.txt', 'chunks/12-k6/easy.txt', 'chunks/12-k4/easy.txt']) {
    if (!existsSync(outPath(f))) continue;
    for (const line of readFileSync(outPath(f), 'utf8').split('\n')) {
      const m = line.match(/#p=(\S+)/);
      if (m) consider(decodePuzzle(m[1]), f.replace(/\.txt$/, ''));
    }
  }
}

/** Generate easy puzzles of many tall sizes and clue kinds, for RESEARCH_MINUTES (default 10). */
export function generated(run: number): void {
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 10) * 60 * 1000;
  const kinds: ClueKind[] = ['walls', 'mixed', 'tiles'];
  for (let seed = run * 1_000_000; Date.now() < end; seed++) {
    const w = 4 + (seed % 5); // 4..8
    const h = w + ((seed >> 3) % 4); // as tall or taller
    const clues = kinds[(seed >> 5) % 3];
    try {
      const r = generate({ w, h, difficulties: ['easy'], clues, minimal: true, attempts: 1, seed });
      if (r.difficulty === 'easy') consider(r.puzzle, `${clues} seed ${seed}`);
    } catch {
      /* no puzzle this seed */
    }
  }
}

/** Sizes for the hard strokes: at least 4 tiles each way, at most 50 in all (already tall). */
const sizeOk = (w: number, h: number) => w >= 4 && h >= 4 && w * h <= 50;
const HARD_SIZES: [number, number][] = [];
for (let w = 4; w <= 7; w++) for (let h = w; w * h <= 50; h++) HARD_SIZES.push([w, h]);

/** Hard single strokes: steps the easy rules can't force, but all the rules (a hint) can. */
export const HARD_LIST = 'single-stroke/hard-levels.txt';

function considerHard(p: Puzzle, source: string) {
  const q = tall(p);
  const code = encodePuzzle(q);
  if (seen.has(code)) return;
  seen.add(code);
  if (!sizeOk(q.w, q.h)) return;
  const s = singleStroke(q, true);
  if (!s || !s.hard) return;
  // A short name (the Library shows size, obstacles, Crux and Effort in their own columns).
  record(HARD_LIST, `Hard stroke ${q.w}×${q.h} · ${s.hard} hard — #p=${code}`);
}

/** Hard single strokes among the puzzles on hand: every research list with codes in it. */
export function existingHard(): void {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.txt') ? [join(dir, d.name)] : []));
  for (const f of files(outPath(''))) {
    if (f.includes('single-stroke') || f.includes('stroke-gen')) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      for (const m of line.matchAll(/#p=([A-Za-z0-9_-]+)/g)) {
        try {
          considerHard(decodePuzzle(m[1]), f.slice(outPath('').length).replace(/\.txt$/, ''));
        } catch {
          /* an old code */
        }
      }
    }
  }
}

/** Generate medium and hard puzzles of many tall sizes and clue kinds, for RESEARCH_MINUTES. */
export function generatedHard(run: number): void {
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 10) * 60 * 1000;
  const kinds: ClueKind[] = ['walls', 'mixed', 'tiles'];
  for (let seed = run * 1_000_000 + 500_000; Date.now() < end; seed++) {
    const [w, h] = HARD_SIZES[seed % HARD_SIZES.length];
    const clues = kinds[(seed >> 5) % 3];
    try {
      const r = generate({ w, h, difficulties: ['medium', 'hard'], clues, minimal: true, attempts: 1, seed });
      if (r.difficulty !== 'easy') considerHard(r.puzzle, `${clues} ${r.difficulty} seed ${seed}`);
    } catch {
      /* no puzzle this seed */
    }
  }
}
