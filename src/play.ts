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

export class PlayView {
  readonly el: HTMLElement;
  /** Called after every change to the player's marks. */
  onProgress?: (progress: Progress, solved: boolean) => void;
  /** Called once per attempt when the puzzle is solved, with the solve time. */
  onSolved?: (elapsedMs: number, stats: AttemptStats) => void;

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
  private shownHint: Hint | null = null;
  /** Reset needs a second tap within a few seconds. */
  private resetArmed = false;
  private resetTimer = 0;
  private resetBtn: HTMLButtonElement;
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
          <button class="btn" data-act="reset" aria-label="Reset puzzle">${ICONS.rotateLeft}</button>
          <button class="btn" data-act="hint" aria-label="Hint">${ICONS.bulb}<span>Hint</span></button>
          <button class="btn primary" data-act="check">${ICONS.check}<span>Check</span></button>
        </div>
      </div>`;
    this.svg = this.el.querySelector('svg')!;
    this.timerEl = this.el.querySelector('.play-timer')!;
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;
    this.resetBtn = this.el.querySelector('[data-act=reset]')!;
    this.resetBtn.addEventListener('click', () => this.tapReset());

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

  /** First tap arms Reset; a second tap within a few seconds resets the puzzle. */
  private tapReset() {
    if (this.resetArmed) {
      this.disarmReset();
      this.playAgain();
      return;
    }
    this.resetArmed = true;
    clearTimeout(this.resetTimer);
    this.resetTimer = window.setTimeout(() => {
      this.disarmReset();
      this.render();
    }, 3000);
    this.render();
  }

  private disarmReset() {
    this.resetArmed = false;
    clearTimeout(this.resetTimer);
  }

  private afterChange() {
    this.disarmReset();
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
    if (firstSolve) this.onSolved?.(this.timer.elapsed, { hints: this.hintsUsed, checks: this.checksUsed });
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
    const show = (text: string, kind: '' | 'success' | 'error') => {
      this.checkMsg = { text, kind };
      this.render();
    };
    if (!n) return show('Nothing drawn yet — every line you draw will be checked against the solution.', '');
    // Obvious problems need no search.
    const live = checkSolution(this.puzzle, this.segments);
    if (live.branches.size || live.loopEdges.size || live.illegalEdges.size || live.checkpointErrors.size) {
      return show('Not all of your lines are right.', 'error');
    }
    show('Checking…', '');
    const run = solveInBackground(this.puzzle, undefined, { mustUse: [...this.segments], maxSolutions: 1, nodeLimit: 5_000_000 });
    this.checkRun = run;
    try {
      const r = await run.result;
      if (this.checkRun !== run) return;
      this.checkRun = null;
      if (r.solutions.length) show(`All ${n} line${n === 1 ? '' : 's'} so far ${n === 1 ? 'is' : 'are'} correct.`, 'success');
      else if (r.status === 'aborted') show("Couldn't finish checking — this puzzle is too big to check quickly.", '');
      else show('Not all of your lines are right.', 'error');
    } catch (err) {
      if (this.checkRun !== run) return;
      this.checkRun = null;
      if ((err as Error).name !== 'AbortError') show(`Check failed: ${(err as Error).message}`, 'error');
    }
  }

  /** Show the simplest logical next step for the current board (without drawing it). */
  private showHint() {
    this.clearCheck();
    this.shownHint = findHint(this.puzzle, { segments: this.segments, xs: this.xMarks });
    // Count hints that actually help (not "no hint available" or "already solved").
    if (this.shownHint.kind === 'deduction' || this.shownHint.kind === 'mistake') {
      if (!this.recorded) this.hintsUsed++;
      this.onProgress?.(this.progress, this.solved);
    }
    this.render();
  }

  render(): void {
    if (!this.puzzle) return;
    const live = checkSolution(this.puzzle, this.segments);
    const check = this.checkMsg;
    const errorCells = new Set<number>(this.autoCheck ? [...live.branches, ...live.checkpointErrors] : []);
    const errorEdges = new Set<number>(this.autoCheck ? [...live.loopEdges, ...live.illegalEdges] : []);
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

    const resetting = this.resetArmed;
    const kind = resetting ? 'error' : live.solved ? 'success' : hint ? (hint.kind === 'mistake' ? 'error' : 'hint') : (check?.kind ?? '');
    this.status.classList.toggle('success', kind === 'success');
    this.status.classList.toggle('error', kind === 'error');
    this.status.classList.toggle('hint', kind === 'hint');
    if (resetting) this.status.textContent = 'Tap reset again to clear your lines and restart the timer, hints and checks.';
    else if (live.solved) this.status.textContent = live.message;
    else if (hint) this.status.textContent = hint.text;
    else if (check) this.status.textContent = check.text;
    else this.status.textContent = '';

    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.resetBtn.classList.toggle('danger', resetting);
    this.resetBtn.setAttribute('aria-label', resetting ? 'Tap again to reset the puzzle' : 'Reset puzzle');
  }
}
