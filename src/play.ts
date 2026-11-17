import { History } from './history';
import { solveInBackground, type SolverRun } from './solver-client';
import { findHint, type Hint } from './logic';
import { formatTime, SolveTimer } from './timer';
import { ICONS } from './icons';
import { attachBoardInput } from './input';
import { cellEdges, edgeBetween, isUsableEdge, type Puzzle } from './model';
import { padFor, renderBoard } from './render';
import { canPlace, checkSolution } from './rules';

export interface Progress {
  segments: number[];
  xMarks: number[];
  /** Time spent on the current attempt so far (never shown while playing). */
  elapsedMs?: number;
  /** The current attempt has already been solved and its time recorded. */
  recorded?: boolean;
  /** Hints shown during the current attempt. */
  hints?: number;
  /** Times Check was used during the current attempt. */
  checks?: number;
}

/** How much help an attempt used. */
export interface AttemptStats {
  hints: number;
  checks: number;
}

/** A hint, or the marks that don't fit the solution. */
type PlayHint = Hint | { kind: 'wrong'; edges: number[]; text: string };

export class PlayView {
  readonly el: HTMLElement;
  /** Called after every change to the player's marks. */
  onProgress?: (progress: Progress, solved: boolean) => void;
  /**
   * Called whenever the board becomes solved, with the attempt's time.
   * `isNew` is true only the first time in an attempt (the time to record).
   */
  onSolved?: (elapsedMs: number, stats: AttemptStats, isNew: boolean) => void;

  private timer = new SolveTimer();
  private recorded = false;
  private hintsUsed = 0;
  private autoCheck = true;
  private checksUsed = 0;
  private timerEl!: HTMLElement;
  private timerTick = 0;

  private puzzle!: Puzzle;
  private segments = new Set<number>();
  private xMarks = new Set<number>();
  private history = new History<Progress>();
  /** Full check result shown after pressing Check, until the next change. */
  /** Result of the last Check, shown until the next change. */
  private checkMsg: { text: string; kind: '' | 'success' | 'error' } | null = null;
  private checkRun: SolverRun | null = null;
  /** Hint shown after pressing Hint, until the next change. */
  private shownHint: PlayHint | null = null;
  /** Solutions of the puzzle, found once in the background when Hint first needs them. */
  private solutions: Promise<number[][]> | null = null;
  private solutionsRun: SolverRun | null = null;
  /** Bumped on every change, so a slow hint can tell the board moved on. */
  private changeCount = 0;
  private solved = false;

  private svg: SVGSVGElement;
  private status: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  // Per-gesture state.
  private before: Progress | null = null;
  private changed = false;
  /**
   * Every drag either only draws or only erases. It is decided where it
   * starts: an empty tile draws; a segment, or a tile the path passes through,
   * erases. On a path end (one segment) it is decided by the first step:
   * back along that segment erases, anywhere else draws.
   */
  private dragMode: 'draw' | 'erase' | 'undecided' = 'draw';
  /** The gesture began on a drawn segment's border (so a tap there is not an X). */
  private startedOnSegment = false;

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'view play-view';
    this.el.innerHTML = `
      <p class="play-timer hidden" aria-label="Solve time"></p>
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle board"></svg></div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="toolbar">
        <div class="toolbar-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}<span>Undo</span></button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}</button>
          <button class="btn" data-act="reset" aria-label="Clear the board" title="Clear the board">${ICONS.rotateLeft}</button>
          <button class="btn" data-act="hint" aria-label="Hint">${ICONS.bulb}<span>Hint</span></button>
          <button class="btn primary" data-act="check">${ICONS.check}<span>Check</span></button>
        </div>
      </div>`;
    this.svg = this.el.querySelector('svg')!;
    this.timerEl = this.el.querySelector('.play-timer')!;
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;
    this.el.querySelector('[data-act=reset]')!.addEventListener('click', () => this.clearBoard());

    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    this.el.querySelector('[data-act=check]')!.addEventListener('click', () => this.check());
    this.el.querySelector('[data-act=hint]')!.addEventListener('click', () => this.showHint());

    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => 'path',
      onGestureStart: () => {
        this.before = this.snapshot();
        this.changed = false;
        this.dragMode = 'draw';
        this.startedOnSegment = false;
      },
      onGestureEnd: () => this.commit(),
      onPathStart: (cell, edge) => {
        if (edge >= 0 && this.segments.has(edge)) {
          // Pressing on a drawn segment erases it, and dragging keeps erasing.
          this.dragMode = 'erase';
          this.startedOnSegment = true;
          this.erase(edge);
          return;
        }
        const drawn = cellEdges(this.puzzle, cell).filter((e) => this.segments.has(e)).length;
        this.dragMode = drawn === 0 ? 'draw' : drawn === 1 ? 'undecided' : 'erase';
      },
      onHoverEdge: (e) => {
        if (this.dragMode === 'erase') this.erase(e);
      },
      onStep: (from, to) => {
        const e = edgeBetween(this.puzzle, from, to);
        if (this.dragMode === 'undecided') this.dragMode = this.segments.has(e) ? 'erase' : 'draw';
        return this.dragMode === 'erase' ? this.erase(e) : this.step(from, to);
      },
      // Tapping an empty border (or right-clicking any border) toggles an X there.
      onTapEdge: (e) => {
        if (!this.startedOnSegment) this.toggleX(e);
      },
      // Tapping a tile removes every segment touching it.
      onTapCell: (cell) => {
        for (const e of cellEdges(this.puzzle, cell)) this.erase(e);
      },
      onSecondaryEdge: (e) => this.toggleX(e),
    });
  }

  load(p: Puzzle, progress?: Progress): void {
    this.puzzle = p;
    this.solutionsRun?.cancel();
    this.solutionsRun = null;
    this.solutions = null;
    this.changeCount++;
    const ok = (e: number) => isUsableEdge(p, e);
    this.segments = new Set((progress?.segments ?? []).filter(ok));
    this.xMarks = new Set((progress?.xMarks ?? []).filter(ok));
    this.history.clear();
    this.clearCheck();
    this.shownHint = null;
    this.solved = checkSolution(p, this.segments).solved;
    // A puzzle that opens already solved does not get a new time.
    this.recorded = !!progress?.recorded || this.solved;
    this.timer.reset(progress?.elapsedMs ?? 0, this.recorded);
    this.hintsUsed = progress?.hints ?? 0;
    this.checksUsed = progress?.checks ?? 0;
    this.render();
  }

  /** Start a new attempt: empty board, fresh timer, no hints or checks (Play again / Reset puzzle). */
  playAgain(): void {
    this.segments.clear();
    this.xMarks.clear();
    this.history.clear();
    this.clearCheck();
    this.solved = false;
    this.recorded = false;
    this.hintsUsed = 0;
    this.checksUsed = 0;
    this.timer.reset(0);
    this.render();
    this.onProgress?.(this.progress, false);
  }

  /** Replace the board with these marks as one undoable step (e.g. the editor's logic steps). */
  setMarks(marks: { segments: number[]; xMarks: number[] }): void {
    const ok = (e: number) => isUsableEdge(this.puzzle, e);
    const before = this.snapshot();
    const segments = new Set(marks.segments.filter(ok));
    const xMarks = new Set(marks.xMarks.filter((e) => ok(e) && !segments.has(e)));
    const same = (a: Set<number>, b: number[]) => a.size === b.length && b.every((e) => a.has(e));
    if (same(segments, before.segments) && same(xMarks, before.xMarks)) return;
    this.history.push(before);
    this.segments = segments;
    this.xMarks = xMarks;
    this.afterChange();
  }

  /** Whether mistakes are highlighted as the player draws. */
  setAutoCheck(on: boolean): void {
    this.autoCheck = on;
    this.render();
  }

  /** Show or hide the running solve time (hidden by default). */
  setShowTimer(show: boolean): void {
    this.timerEl.classList.toggle('hidden', !show);
    clearInterval(this.timerTick);
    if (show) {
      const update = () => (this.timerEl.textContent = formatTime(this.timer.elapsed));
      update();
      this.timerTick = window.setInterval(update, 500);
    }
  }

  /** Whether the play view is in front of the player (so the timer may run). */
  setActive(active: boolean): void {
    this.timer.setActive(active);
  }

  /** Marks plus the attempt's timing, for saving. */
  get progress(): Progress {
    return {
      ...this.snapshot(),
      elapsedMs: Math.round(this.timer.elapsed),
      recorded: this.recorded,
      hints: this.hintsUsed,
      checks: this.checksUsed,
    };
  }

  get isSolved(): boolean {
    return this.solved;
  }

  handleKey(ev: KeyboardEvent): boolean {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'z') {
      ev.shiftKey ? this.redo() : this.undo();
      return true;
    }
    if (mod && ev.key.toLowerCase() === 'y') {
      this.redo();
      return true;
    }
    return false;
  }

  private snapshot(): Progress {
    return { segments: [...this.segments], xMarks: [...this.xMarks] };
  }

  private restore(s: Progress) {
    this.segments = new Set(s.segments);
    this.xMarks = new Set(s.xMarks);
  }

  /** A border can hold an X if a segment could ever go there. */
  private canMark(e: number): boolean {
    return isUsableEdge(this.puzzle, e);
  }

  private setSegment(e: number, on: boolean) {
    if (on) {
      if (!canPlace(this.puzzle, e) || this.segments.has(e)) return;
      this.segments.add(e);
      this.xMarks.delete(e);
    } else {
      if (!this.segments.delete(e)) return;
    }
    this.changed = true;
  }

  private setX(e: number, on: boolean) {
    if (on) {
      if (this.xMarks.has(e)) return;
      this.xMarks.add(e);
      this.segments.delete(e);
    } else if (!this.xMarks.delete(e)) {
      return;
    }
    this.changed = true;
    this.render();
  }

  private toggleX(e: number) {
    if (!this.canMark(e)) return;
    this.setX(e, !this.xMarks.has(e));
  }

  /** Remove a drawn segment if there is one. Always lets an erasing drag continue. */
  private erase(e: number): boolean {
    if (e >= 0 && this.segments.has(e)) {
      this.setSegment(e, false);
      this.render();
    }
    return true;
  }

  /** A drawing drag moved between tiles: add that segment (never removes). */
  private step(from: number, to: number): boolean {
    const e = edgeBetween(this.puzzle, from, to);
    if (e < 0 || !canPlace(this.puzzle, e)) return false;
    this.setSegment(e, true);
    this.render();
    return true;
  }

  private commit() {
    if (this.changed && this.before) {
      this.history.push(this.before);
      this.afterChange();
    }
    this.before = null;
    this.changed = false;
  }

  /** Reset: empty the board as one undoable step. The timer, hints and checks carry on. */
  private clearBoard() {
    if (!this.segments.size && !this.xMarks.size) return;
    this.history.push(this.snapshot());
    this.segments.clear();
    this.xMarks.clear();
    this.afterChange();
  }

  private afterChange() {
    this.changeCount++;
    this.clearCheck();
    this.shownHint = null;
    const wasSolved = this.solved;
    this.solved = checkSolution(this.puzzle, this.segments).solved;
    if (this.solved && !wasSolved) navigator.vibrate?.([30, 60, 30]);
    const firstSolve = this.solved && !this.recorded;
    if (firstSolve) {
      this.timer.stop();
      this.recorded = true;
    }
    this.render();
    this.onProgress?.(this.progress, this.solved);
    // Every time the board becomes solved (e.g. again after Reset or Undo), not just the first.
    if (this.solved && !wasSolved) this.onSolved?.(this.timer.elapsed, { hints: this.hintsUsed, checks: this.checksUsed }, firstSolve);
  }

  private undo() {
    const prev = this.history.undo(this.snapshot());
    if (!prev) return;
    this.restore(prev);
    this.afterChange();
  }

  private redo() {
    const next = this.history.redo(this.snapshot());
    if (!next) return;
    this.restore(next);
    this.afterChange();
  }

  private clearCheck() {
    this.checkRun?.cancel();
    this.checkRun = null;
    this.checkMsg = null;
  }

  /** Tell the player whether every line drawn so far can be part of the solution. */
  private async check() {
    if (this.solved) return;
    this.shownHint = null;
    this.clearCheck();
    if (!this.recorded) this.checksUsed++;
    this.onProgress?.(this.progress, this.solved);
    const n = this.segments.size;
    const x = this.xMarks.size;
    const show = (text: string, kind: '' | 'success' | 'error') => {
      this.checkMsg = { text, kind };
      this.render();
    };
    if (!n && !x) return show('Nothing drawn yet — every line and X you place will be checked against the solution.', '');
    // Obvious problems need no search.
    const live = checkSolution(this.puzzle, this.segments);
    if (live.branches.size || live.loopEdges.size || live.illegalEdges.size || live.checkpointErrors.size) {
      return show('Not all of your lines are right.', 'error');
    }
    show('Checking…', '');
    // Is there a solution that uses every line and none of the X'd borders? (X marks act as walls.)
    const withXs = (p: Puzzle): Puzzle => ({ ...p, walls: new Set([...p.walls, ...this.xMarks]) });
    const fits = async (puzzle: Puzzle) => {
      const run = solveInBackground(puzzle, undefined, { mustUse: [...this.segments], maxSolutions: 1, nodeLimit: 5_000_000 });
      this.checkRun = run;
      const r = await run.result;
      if (this.checkRun !== run) throw new DOMException('Superseded', 'AbortError');
      this.checkRun = null;
      return r.solutions.length ? 'yes' : r.status === 'aborted' ? 'unknown' : 'no';
    };
    const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    try {
      const all = await fits(withXs(this.puzzle));
      if (all === 'yes') {
        const what = [n ? plural(n, 'line', 'lines') : '', x ? plural(x, 'X', "X's") : ''].filter(Boolean).join(' and ');
        if (n + x === 1) return show(`Your ${n ? 'line' : 'X'} is correct.`, 'success');
        return show(`Your ${what} are all correct so far.`, 'success');
      }
      if (all === 'unknown') return show("Couldn't finish checking — this puzzle is too big to check quickly.", '');
      if (!x) return show('Not all of your lines are right.', 'error');
      if (!n) return show("Not all of your X's are right — the path needs at least one of those borders.", 'error');
      // Say which kind of mark is wrong, if the lines alone are fine.
      const lines = await fits(this.puzzle);
      if (lines === 'yes') show("Your lines are fine, but at least one X is wrong — the path needs one of those borders.", 'error');
      else show('Not all of your lines are right.', 'error');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') show(`Check failed: ${(err as Error).message}`, 'error');
    }
  }

  /** The puzzle's solutions (up to 50), solved once in the background; empty if too big to solve. */
  private findSolutions(): Promise<number[][]> {
    if (!this.solutions) {
      const run = solveInBackground(this.puzzle, undefined, { maxSolutions: 50, nodeLimit: 5_000_000 });
      this.solutionsRun = run;
      this.solutions = run.result.then(
        (r) => r.solutions,
        () => [],
      );
    }
    return this.solutions;
  }

  /**
   * Hint: first point out any lines or X marks that don't fit the solution;
   * otherwise show the simplest logical next step (without drawing it).
   */
  private async showHint() {
    this.clearCheck();
    const changes = this.changeCount;
    const count = () => {
      if (!this.recorded) this.hintsUsed++;
      this.onProgress?.(this.progress, this.solved);
    };
    if (this.segments.size || this.xMarks.size) {
      this.shownHint = { kind: 'none', text: 'Thinking…' };
      this.render();
      const solutions = await this.findSolutions();
      if (changes !== this.changeCount) return; // the board changed meanwhile
      if (solutions.length) {
        // Compare with the solution closest to the board (puzzles from the editor may have several).
        let best: { lines: number[]; xs: number[] } | null = null;
        for (const sol of solutions) {
          const used = new Set(sol);
          const lines = [...this.segments].filter((e) => !used.has(e));
          const xs = [...this.xMarks].filter((e) => used.has(e));
          if (!best || lines.length + xs.length < best.lines.length + best.xs.length) best = { lines, xs };
        }
        if (best && best.lines.length + best.xs.length) {
          this.shownHint = { kind: 'wrong', edges: [...best.lines, ...best.xs], text: wrongText(best.lines.length, best.xs.length) };
          count();
          this.render();
          return;
        }
      }
    }
    this.shownHint = findHint(this.puzzle, { segments: this.segments, xs: this.xMarks });
    // Count hints that actually help (not "no hint available" or "already solved").
    if (this.shownHint.kind === 'deduction' || this.shownHint.kind === 'mistake') count();
    this.render();
  }

  render(): void {
    if (!this.puzzle) return;
    const live = checkSolution(this.puzzle, this.segments);
    const check = this.checkMsg;
    const errorCells = new Set<number>(this.autoCheck ? [...live.branches, ...live.checkpointErrors] : []);
    const errorEdges = new Set<number>(this.autoCheck ? [...live.loopEdges, ...live.illegalEdges] : []);
    if (!live.solved && this.shownHint?.kind === 'wrong') for (const e of this.shownHint.edges) errorEdges.add(e);
    // A shown hint is drawn on top of the board in the highlight colour.
    const hint = live.solved ? null : this.shownHint;
    const d = hint?.kind === 'deduction' ? hint.deduction : null;
    const focus = d ? (d.cells ?? [d.cell]) : hint?.kind === 'mistake' ? (hint.cells ?? [hint.cell]) : [];
    renderBoard(this.svg, this.puzzle, {
      pad: padFor(this.puzzle),
      segments: d ? new Set([...this.segments, ...d.segments]) : this.segments,
      xMarks: d ? new Set([...this.xMarks, ...d.xs]) : this.xMarks,
      highlight: d ? new Set([...d.segments, ...d.xs]) : undefined,
      focusCells: focus.length ? new Set(focus) : undefined,
      errorCells,
      errorEdges,
      solved: live.solved,
    });

    const kind = live.solved ? 'success' : hint ? (hint.kind === 'mistake' || hint.kind === 'wrong' ? 'error' : 'hint') : (check?.kind ?? '');
    this.status.classList.toggle('success', kind === 'success');
    this.status.classList.toggle('error', kind === 'error');
    this.status.classList.toggle('hint', kind === 'hint');
    if (live.solved) this.status.textContent = live.message;
    else if (hint) this.status.textContent = hint.text;
    else if (check) this.status.textContent = check.text;
    else this.status.textContent = '';

    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
  }
}

/** What a Hint says about marks that don't fit the solution. */
function wrongText(lines: number, xs: number): string {
  const lineText = lines === 1 ? 'line that isn’t part of the solution' : 'lines that aren’t part of the solution';
  const xText = xs === 1 ? 'X on a border the path needs' : 'X’s on borders the path needs';
  if (!xs) return lines === 1 ? 'The highlighted line isn’t part of the solution.' : `These ${lines} highlighted lines aren’t part of the solution.`;
  if (!lines) return xs === 1 ? 'The highlighted X is on a border the path needs.' : `These ${xs} highlighted X’s are on borders the path needs.`;
  return `The highlighted marks are wrong: ${lines} ${lineText} and ${xs} ${xText}.`;
}
