import { runLogic, runStroke, type LogicOptions, type RuleId } from './logic';
import { clonePuzzle, edgeCells, edgeCount, isOneShot, type Puzzle } from './model';
import { solve } from './solver';

/**
 * The editor's Suggest: the wall to add that lets the logic go furthest. Each border between two
 * open tiles without a wall gets one in turn; the chosen rules then run to the end (for a
 * one-shot, its stroke), and the wall after which they draw the most lines (then put down the
 * most X marks) wins, as long as the puzzle keeps a solution.
 */

export interface WallSuggestion {
  edge: number;
  /** Lines the rules draw with the wall, and without it. */
  lines: number;
  before: number;
}

/** How far the rules get: lines drawn, then X marks; null if they find the puzzle has no solution. */
function reach(p: Puzzle, rules: RuleId[], opts: LogicOptions): { lines: number; xs: number } | null {
  const run = isOneShot(p) ? runStroke(p, rules, undefined, opts) : runLogic(p, rules, undefined, opts);
  if (run.contradiction) return null;
  return { lines: run.state.segments.size, xs: run.state.xs.size };
}

export function suggestWall(
  p: Puzzle,
  rules: RuleId[],
  opts: LogicOptions = {},
  onProgress?: (done: number, total: number) => void,
): WallSuggestion | null {
  const base = reach(p, rules, opts);
  const candidates: number[] = [];
  for (let e = 0; e < edgeCount(p); e++) {
    if (p.walls.has(e)) continue;
    const [a, b] = edgeCells(p, e);
    if (!p.blocked.has(a) && !p.blocked.has(b)) candidates.push(e);
  }
  const scored: { edge: number; lines: number; xs: number }[] = [];
  candidates.forEach((edge, i) => {
    const q = clonePuzzle(p);
    q.walls.add(edge);
    const r = reach(q, rules, opts);
    if (r) scored.push({ edge, ...r });
    onProgress?.(i + 1, candidates.length);
  });
  // Best first; the first that keeps a solution (the rules can't always tell) wins.
  scored.sort((x, y) => y.lines - x.lines || y.xs - x.xs);
  for (const s of scored) {
    if (base && s.lines <= base.lines && s.xs <= base.xs) break;
    const q = clonePuzzle(p);
    q.walls.add(s.edge);
    const status = solve(q, { maxSolutions: 1, nodeLimit: 200_000 }).status;
    if (status === 'none') continue;
    return { edge: s.edge, lines: s.lines, before: base?.lines ?? 0 };
  }
  return null;
}
