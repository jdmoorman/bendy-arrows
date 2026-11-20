import { History } from './history';
import { solveInBackground, type SolverRun } from './solver-client';
import { findHint, findStrokeHint, type Hint } from './logic';
import { ICONS } from './icons';
import { attachBoardInput } from './input';
import { cellEdges, edgeBetween, edgeCells, isUsableEdge, portCell, type Puzzle } from './model';
import { padFor, renderBoard } from './render';
import { canPlace, checkSolution } from './rules';

export interface Progress {
  segments: number[];
  xMarks: number[];
}

/** A hint, or the marks that don't fit the solution. */
type PlayHint = Hint | { kind: 'wrong'; edges: number[]; text: string };

export class PlayView {
  readonly el: HTMLElement;
  /** Called after every change to the player's marks. */
  onProgress?: (progress: Progress, solved: boolean) => void;
  /** Called whenever the board becomes solved. */
  onSolved?: () => void;
  /**
   * The second button beside Reset (e.g. Next level), worked out when the view is built
   * and on each load; none if this returns null.
   */
  solvedAction: () => { label: string; run: () => void } | null = () => null;
  private nextBtn!: HTMLButtonElement;

  private autoCheck = false;
  /** One-shot mode: the path is drawn as one stroke from the entrance (see `strokeCells`). */
  private oneStroke = false;

  private puzzle!: Puzzle;
  private segments = new Set<number>();
  private xMarks = new Set<number>();
  private history = new History<Progress>();
  /** Hint shown after pressing Hint, until the next change. */
  private shownHint: PlayHint | null = null;
  /** Solutions of the puzzle, found once in the background when Hint first needs them. */
  private solutions: Promise<number[][]> | null = null;
  private solutionsRun: SolverRun | null = null;
  /** The solutions once found, for auto-check (null until then). */
  private knownSolutions: number[][] | null = null;
  /** Bumped on every change, so a slow hint can tell the board moved on. */
  private changeCount = 0;
  private solved = false;

  private svg: SVGSVGElement;
  private status: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  // Per-gesture state.
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
  /** One-shot mode: the drag has started from a tile of the stroke (and cut it back to there). */
  private strokeDrag: 'none' | 'pending' | 'drawing' = 'none';

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'view play-view';
    this.el.innerHTML = `
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle board"></svg></div>
      <div class="toolbar">
        <div class="toolbar-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}<span>Undo</span></button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}<span>Redo</span></button>
          <button class="btn" data-act="hint" aria-label="Hint">${ICONS.bulb}<span>Hint</span></button>
        </div>
      </div>
      <div class="solved-row">
        <button class="btn" data-act="reset">${ICONS.rotateLeft}<span>Reset</span></button>
        <button class="btn primary" data-act="next"><span>Next level</span></button>
      </div>
      <p class="status" role="status" aria-live="polite"></p>`;
    this.svg = this.el.querySelector('svg')!;
    // Upright, the board sits at the bottom of its space, right above the toolbar; side by side
    // (landscape), it stays centred beside the buttons.
    const upright = window.matchMedia('(orientation: portrait), (max-width: 599px)');
    const place = () => this.svg.setAttribute('preserveAspectRatio', upright.matches ? 'xMidYMax meet' : 'xMidYMid meet');
    place();
    upright.addEventListener('change', place);
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;

    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    this.el.querySelector('[data-act=hint]')!.addEventListener('click', () => this.showHint());
    this.nextBtn = this.el.querySelector('[data-act=next]')!;
    // Reset always works; Next level always shows and works once the board is solved, greyed out
    // until then. It must not appear on solving: in Safari on iPhone, content that becomes visible
    // right after a tap is taken as a hover menu, and the next tap is spent closing it (every
    // button took two taps).
    this.el.querySelector('[data-act=reset]')!.addEventListener('click', () => this.reset());
    this.nextBtn.addEventListener('click', () => this.solvedAction()?.run());

    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => 'path',
      onGestureStart: () => {
        this.changed = false;
        this.dragMode = 'draw';
        this.startedOnSegment = false;
        this.strokeDrag = 'none';
      },
      onGestureEnd: () => this.commit(),
      onPathStart: (cell, edge) => {
        if (this.strokeMode) {
          this.startedOnSegment = edge >= 0 && this.segments.has(edge);
          this.strokeDrag = this.strokeCells().includes(cell) ? 'pending' : 'none';
          return;
        }
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
        if (this.strokeMode) return;
        if (this.dragMode === 'erase') this.erase(e);
      },
      onStep: (from, to) => {
        if (this.strokeMode) return this.strokeStep(from, to);
        const e = edgeBetween(this.puzzle, from, to);
        if (this.dragMode === 'undecided') this.dragMode = this.segments.has(e) ? 'erase' : 'draw';
        return this.dragMode === 'erase' ? this.erase(e) : this.step(from, to);
      },
      // Tapping an empty border (or right-clicking any border) toggles an X there.
      onTapEdge: (e) => {
        if (!this.startedOnSegment) return this.toggleX(e);
        // One-shot mode: tapping one of the stroke's lines takes the stroke back to before it.
        const s = this.strokeMode ? this.strokeCells() : [];
        const i = s.findIndex((c, k) => k > 0 && edgeBetween(this.puzzle, s[k - 1], c) === e);
        if (i > 0) this.cutStroke(s, i - 1);
      },
      // Tapping a tile removes every segment touching it (in one-shot mode, a tile of the
      // stroke takes the stroke back to it).
      onTapCell: (cell) => {
        if (this.strokeMode) {
          const s = this.strokeCells();
          const i = s.indexOf(cell);
          if (i >= 0) return this.cutStroke(s, i);
        }
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
    this.knownSolutions = null;
    this.changeCount++;
    const ok = (e: number) => isUsableEdge(p, e);
    this.segments = new Set((progress?.segments ?? []).filter(ok));
    this.xMarks = new Set((progress?.xMarks ?? []).filter(ok));
    this.history.clear();
    this.shownHint = null;
    this.solved = checkSolution(p, this.segments).solved;
    const action = this.solvedAction();
    this.nextBtn.querySelector('span')!.textContent = action?.label ?? '';
    this.nextBtn.classList.toggle('hidden', !action);
    this.render();
  }

  /** Reset: empty the board, as one undoable step. */
  private reset() {
    if (!this.segments.size && !this.xMarks.size) return;
    this.history.push(this.snapshot());
    this.segments.clear();
    this.xMarks.clear();
    this.afterChange();
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

  /** One-shot mode: draw one stroke from the entrance, and get hints for that stroke. */
  setOneStroke(on: boolean): void {
    this.oneStroke = on;
    this.shownHint = null;
    this.render();
  }

  /** One-shot mode is on and the puzzle has an entrance to start from. */
  private get strokeMode(): boolean {
    return this.oneStroke && this.puzzle.endpoints.length > 0;
  }

  /**
   * The stroke's tiles in order: from the entrance tile, along the drawn lines, as far as they
   * go. (Lines not joined to it are left alone.)
   */
  private strokeCells(): number[] {
    const p = this.puzzle;
    let cur = portCell(p, p.endpoints[0].port);
    const cells = [cur];
    const seen = new Set(cells);
    for (;;) {
      const next = cellEdges(p, cur)
        .filter((e) => this.segments.has(e))
        .map((e) => edgeCells(p, e).find((c) => c !== cur)!)
        .find((c) => !seen.has(c));
      if (next === undefined) return cells;
      cells.push(next);
      seen.add(next);
      cur = next;
    }
  }

  /** Take the stroke back to its `i`th tile, removing the lines after it. */
  private cutStroke(s: number[], i: number) {
    for (let k = s.length - 1; k > i; k--) this.setSegment(edgeBetween(this.puzzle, s[k - 1], s[k]), false);
    this.render();
  }

  /**
   * One-shot mode: a drag that starts on the stroke cuts it back to there, then draws on from
   * its end. Going back onto the tile before takes the last line back; the stroke never runs
   * into itself.
   */
  private strokeStep(from: number, to: number): boolean {
    if (this.strokeDrag === 'none') return false;
    const s = this.strokeCells();
    if (this.strokeDrag === 'pending') {
      const i = s.indexOf(from);
      if (i < 0) return false;
      this.cutStroke(s, i);
      s.length = i + 1;
      this.strokeDrag = 'drawing';
    }
    if (s[s.length - 1] !== from) return false;
    if (s.length > 1 && to === s[s.length - 2]) {
      this.cutStroke(s, s.length - 2);
      return true;
    }
    if (s.includes(to)) return false;
    return this.step(from, to);
  }

  /** Whether mistakes are highlighted as the player draws. */
  setAutoCheck(on: boolean): void {
    this.autoCheck = on;
    this.render();
  }

  /** The player's marks, for saving. */
  get progress(): Progress {
    return this.snapshot();
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

  /** About to change one mark: save the board first, so Undo takes back one placement at a time. */
  private placing() {
    this.history.push(this.snapshot());
    this.changed = true;
  }

  private setSegment(e: number, on: boolean) {
    if (on) {
      if (!canPlace(this.puzzle, e) || this.segments.has(e)) return;
      this.placing();
      this.segments.add(e);
      this.xMarks.delete(e);
    } else {
      if (!this.segments.has(e)) return;
      this.placing();
      this.segments.delete(e);
    }
  }

  private setX(e: number, on: boolean) {
    if (on) {
      if (this.xMarks.has(e)) return;
      this.placing();
      this.xMarks.add(e);
      this.segments.delete(e);
    } else {
      if (!this.xMarks.has(e)) return;
      this.placing();
      this.xMarks.delete(e);
    }
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
    // Each placement already saved its own undo step; just catch up after the gesture.
    if (this.changed) this.afterChange();
    this.changed = false;
  }

  private afterChange() {
    this.changeCount++;
    this.shownHint = null;
    const wasSolved = this.solved;
    this.solved = checkSolution(this.puzzle, this.segments).solved;
    this.render();
    this.onProgress?.(this.progress, this.solved);
    // Every time the board becomes solved (e.g. again after Reset or Undo), not just the first.
    if (this.solved && !wasSolved) this.onSolved?.();
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

  /** The puzzle's solutions (up to 50), solved once in the background; empty if too big to solve. */
  private findSolutions(): Promise<number[][]> {
    if (!this.solutions) {
      const run = solveInBackground(this.puzzle, undefined, { maxSolutions: 50, nodeLimit: 5_000_000 });
      this.solutionsRun = run;
      const puzzle = this.puzzle;
      this.solutions = run.result.then(
        (r) => r.solutions,
        () => [],
      ).then((sols) => {
        if (this.puzzle === puzzle) this.knownSolutions = sols;
        return sols;
      });
    }
    return this.solutions;
  }

  /**
   * Auto-check: the lines and X marks that don't fit the solution (the closest one,
   * if there are several). Nothing until the solutions are found in the background,
   * and nothing if the puzzle is too big to solve.
   */
  private autoCheckEdges(): number[] {
    if (!this.knownSolutions) {
      if (!this.solutions) void this.findSolutions().then(() => this.autoCheck && this.render());
      return [];
    }
    const best = closestWrong(this.knownSolutions, this.segments, this.xMarks);
    return best ? [...best.lines, ...best.xs] : [];
  }

  /**
   * Hint: first point out any lines or X marks that don't fit the solution;
   * otherwise show the simplest logical next step (without drawing it).
   * Pressing it again while a hint is showing (or still thinking) hides it.
   */
  private async showHint() {
    if (this.shownHint) {
      this.shownHint = null;
      this.changeCount++; // drops a hint that is still being worked out
      this.render();
      return;
    }
    const changes = this.changeCount;
    if (this.segments.size || this.xMarks.size) {
      this.shownHint = { kind: 'none', text: 'Thinking…' };
      this.render();
      const solutions = await this.findSolutions();
      if (changes !== this.changeCount) return; // the board changed meanwhile
      const best = closestWrong(solutions, this.segments, this.xMarks);
      if (best && best.lines.length + best.xs.length) {
        this.shownHint = { kind: 'wrong', edges: [...best.lines, ...best.xs], text: wrongText(best.lines.length, best.xs.length) };
        this.render();
        return;
      }
    }
    if (this.strokeMode) {
      // The next line of the stroke, from the stroke alone.
      const s = this.strokeCells();
      const lines = new Set(s.slice(1).map((c, k) => edgeBetween(this.puzzle, s[k], c)));
      this.shownHint = findStrokeHint(this.puzzle, lines, s[s.length - 1]);
    } else {
      this.shownHint = findHint(this.puzzle, { segments: this.segments, xs: this.xMarks });
    }
    this.render();
  }

  render(): void {
    if (!this.puzzle) return;
    const errorCells = new Set<number>();
    const errorEdges = new Set<number>(this.autoCheck ? this.autoCheckEdges() : []);
    if (this.shownHint?.kind === 'wrong') for (const e of this.shownHint.edges) errorEdges.add(e);
    // A shown hint is drawn on top of the board in the highlight colour.
    const hint = this.shownHint;
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
      solved: this.solved,
    });

    const kind = hint ? (hint.kind === 'mistake' || hint.kind === 'wrong' ? 'error' : 'hint') : '';
    this.status.classList.toggle('error', kind === 'error');
    this.status.classList.toggle('hint', kind === 'hint');
    this.status.textContent = hint ? hint.text : '';

    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.nextBtn.disabled = !this.solved;
  }

}

/** The marks that don't fit the solution closest to the board (puzzles from the editor may have several). */
function closestWrong(solutions: number[][], segments: Set<number>, xMarks: Set<number>): { lines: number[]; xs: number[] } | null {
  let best: { lines: number[]; xs: number[] } | null = null;
  for (const sol of solutions) {
    const used = new Set(sol);
    const lines = [...segments].filter((e) => !used.has(e));
    const xs = [...xMarks].filter((e) => used.has(e));
    if (!best || lines.length + xs.length < best.lines.length + best.xs.length) best = { lines, xs };
  }
  return best;
}

/** What a Hint says about marks that don't fit the solution. */
function wrongText(lines: number, xs: number): string {
  const lineText = lines === 1 ? 'line that isn’t part of the solution' : 'lines that aren’t part of the solution';
  const xText = xs === 1 ? 'X on a border the path needs' : 'X’s on borders the path needs';
  if (!xs) return lines === 1 ? 'The highlighted line isn’t part of the solution.' : `These ${lines} highlighted lines aren’t part of the solution.`;
  if (!lines) return xs === 1 ? 'The highlighted X is on a border the path needs.' : `These ${xs} highlighted X’s are on borders the path needs.`;
  return `The highlighted marks are wrong: ${lines} ${lineText} and ${xs} ${xText}.`;
}
