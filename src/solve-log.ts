import { encodePuzzle } from './codec';
import { cellRC, edgeCells, type Puzzle } from './model';
import { columnName } from './render';

/**
 * A record of exactly how a puzzle was played, one line per step: each line drawn or erased,
 * each X placed or taken away, undo, redo, reset, hints and solving, with the time since the
 * start, for showing how a solve went (Settings → Export solve logs downloads them all). Kept
 * per puzzle across reloads, for the last few dozen puzzles.
 */

const KEY = 'bendyarrows.solvelog.v1';
/** How many puzzles' logs are kept. */
const KEEP = 60;

interface Log {
  code: string;
  /** When the first step was taken (ms since 1970). */
  start: number;
  steps: string[];
}

function loadAll(): Log[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveAll(logs: Log[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(logs.slice(-KEEP)));
  } catch {
    /* storage full or blocked: the log just isn't kept */
  }
}

/** A tile as the board's coordinates show it: column letter, row number (e.g. "B3"). */
function tileName(p: Puzzle, cell: number): string {
  const [r, c] = cellRC(p, cell);
  return `${columnName(c)}${r + 1}`;
}

/** A border as the two tiles it's between (e.g. "B3-C3"). */
export function edgeName(p: Puzzle, e: number): string {
  return edgeCells(p, e)
    .map((c) => tileName(p, c))
    .join('-');
}

/** One log as text: the puzzle's link (and name, if given), then one step per line. Empty if no steps. */
function logText(log: Log, name?: string): string {
  if (!log.steps.length) return '';
  const link = `${location.origin}${location.pathname}#p=${log.code}`;
  return [`Solve log for ${name ? `${name}, ` : ''}${link}`, `${log.steps.length} steps`, ...log.steps].join('\n');
}

/** One puzzle's kept log as text (named `name`), or '' if it has none. */
export function puzzleLogText(code: string, name?: string): string {
  const log = loadAll().find((l) => l.code === code);
  return log ? logText(log, name) : '';
}

/** Every kept log (the last few puzzles played), oldest first, each named by `nameOf` if it can. */
export function allLogsText(nameOf: (code: string) => string | undefined): string {
  return loadAll()
    .map((l) => logText(l, nameOf(l.code)))
    .filter(Boolean)
    .join('\n\n');
}

export class SolveLog {
  private puzzle: Puzzle | null = null;
  private log: Log | null = null;

  /** Start (or, for the same puzzle as before, carry on) the log for a puzzle. */
  load(p: Puzzle): void {
    this.puzzle = p;
    const code = encodePuzzle(p);
    this.log = loadAll().find((l) => l.code === code) ?? { code, start: 0, steps: [] };
  }

  /** Note one step, e.g. "+line B3-C3" or "hint balance". */
  note(step: string): void {
    if (!this.log) return;
    const now = Date.now();
    if (!this.log.start) this.log.start = now;
    this.log.steps.push(`${((now - this.log.start) / 1000).toFixed(1)}s ${step}`);
    const logs = loadAll().filter((l) => l.code !== this.log!.code);
    saveAll([...logs, this.log]);
  }

  /** Note a change made all at once (undo, redo, reset…): what it did to the lines and X marks. */
  noteChange(what: string, before: { segments: number[]; xMarks: number[] }, after: { segments: number[]; xMarks: number[] }): void {
    if (!this.puzzle) return;
    const p = this.puzzle;
    const diff = (a: number[], b: number[]) => a.filter((e) => !b.includes(e)).map((e) => edgeName(p, e));
    const parts = [
      ...diff(after.segments, before.segments).map((e) => `+line ${e}`),
      ...diff(before.segments, after.segments).map((e) => `-line ${e}`),
      ...diff(after.xMarks, before.xMarks).map((e) => `+X ${e}`),
      ...diff(before.xMarks, after.xMarks).map((e) => `-X ${e}`),
    ];
    this.note(`${what}${parts.length ? `: ${parts.join(', ')}` : ''}`);
  }
}
