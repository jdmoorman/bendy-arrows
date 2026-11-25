import { History } from './history';
import { solveInBackground, type SolverRun } from './solver-client';
import { findHint, findStrokeHint, hintPrompt, strokeFrom, trialPreview, type Hint } from './logic';
import { ICONS } from './icons';
import { attachBoardInput } from './input';
import { cellAt, cellEdges, cellRC, edgeBetween, isOneShot, isUsableEdge, type Puzzle } from './model';

/** One-shot mode's keys that move the stroke's head: row and column steps. */
const KEY_STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  w: [-1, 0],
  s: [1, 0],
  a: [0, -1],
  d: [0, 1],
};
import { padFor, renderBoard } from './render';
import { canPlace, checkSolution } from './rules';
import { edgeName, SolveLog } from './solve-log';
import { toast } from './ui';

export interface Progress {
  segments: number[];
  xMarks: number[];
  /** One-shots: how many times the player has taken the stroke back so far. */
  backtracks?: number;
  /** Hints shown so far on this board. */
  hints?: number;
  /** Auto-check has shown a mistake on this board (no gold star then). */
  checked?: boolean;
}

/**
 * The marks that don't fit the solution: the wrong lines and wrong X's as first pointed out
 * (those still on the board are shown), and the board as last seen, to tell what a change deleted.
 */
interface WrongHint {
  kind: 'wrong';
  lines: number[];
  xs: number[];
  edges: number[];
  text: string;
  seen: { segments: Set<number>; xs: Set<number> };
}

/** A hint, or the marks that don't fit the solution. */
type PlayHint = Hint | WrongHint;

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

  private puzzle!: Puzzle;
  private segments = new Set<number>();
  private xMarks = new Set<number>();
  private history = new History<Progress>();
  /** Hint shown after pressing Hint, until the next change. */
  private shownHint: PlayHint | null = null;
  /**
   * One-shots: backtracks, each a time the player took the stroke back (a drag back along it, a
   * tap that cuts it, an Undo or Reset that takes lines off it), however far back; and which way
   * the gesture under way last went (going back after going on is a new backtrack, so a drag
   * that wiggles back and forth counts each time it turns back).
   */
  private backtracks = 0;
  private strokeWay: 'on' | 'back' | null = null;
  /** Hints shown on this board (a hint pointing out wrong marks counts too). */
  private hintsUsed = 0;
  /** Auto-check has shown a mistake on this board: like a hint, it costs the gold star. */
  private caught = false;
  /** The Hints show the move setting. */
  private hintMoves = false;
  /** Solutions of the puzzle, found once in the background when Hint first needs them. */
  private solutions: Promise<number[][]> | null = null;
  private solutionsRun: SolverRun | null = null;
  /** The solutions once found, for auto-check (null until then). */
  private knownSolutions: number[][] | null = null;
  /** Bumped on every change, so a slow hint can tell the board moved on. */
  private changeCount = 0;
  private solved = false;
  /** Every step taken on this puzzle, for the Share sheet's Copy solve log. */
  readonly log = new SolveLog();

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
  /** This gesture already said why it can't draw there (one-shot mode), so it says it once. */
  private strokeWarned = false;

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
        <button class="btn" data-act="reset">${ICONS.reset}<span>Reset</span></button>
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
    // The only messages are hints (upright, they pop up over the buttons): a tap puts the hint
    // away, its highlight too.
    this.status.addEventListener('click', () => {
      if (!this.shownHint) return;
      this.shownHint = null;
      this.render();
    });
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
        this.strokeWarned = false;
        this.strokeWay = null;
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
    this.backtracks = progress?.backtracks ?? 0;
    this.strokeWay = null;
    this.hintsUsed = progress?.hints ?? 0;
    this.caught = !!progress?.checked;
    this.history.clear();
    this.shownHint = null;
    this.solved = checkSolution(p, this.segments).solved;
    this.log.load(p);
    const action = this.solvedAction();
    this.nextBtn.querySelector('span')!.textContent = action?.label ?? '';
    this.nextBtn.classList.toggle('hidden', !action);
    this.render();
  }

  /** Reset: empty the board, as one undoable step. */
  private reset() {
    if (!this.segments.size && !this.xMarks.size) return;
    // A fresh start: the hint and backtrack counts start over too (and a perfect solve is possible again).
    this.hintsUsed = 0;
    this.backtracks = 0;
    this.caught = false;
    const before = this.snapshot();
    this.history.push(before);
    this.segments.clear();
    this.xMarks.clear();
    this.log.noteChange('reset', before, this.snapshot());
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
    this.log.noteChange('marks set', before, this.snapshot());
    this.afterChange();
  }

  /**
   * One-shot mode, for one-shot puzzles: the path is drawn as one stroke from the entrance
   * (going back over it takes it back), and hints are for that stroke.
   */
  private get strokeMode(): boolean {
    return isOneShot(this.puzzle);
  }

  /** The stroke's tiles in order, from the entrance tile along the drawn lines (see `strokeFrom`). */
  private strokeCells(): number[] {
    return strokeFrom(this.puzzle, this.segments).tiles;
  }

  /** Take the stroke back to its `i`th tile, removing the lines after it. */
  private cutStroke(s: number[], i: number) {
    if (i < s.length - 1 && this.strokeWay !== 'back') {
      this.noteBacktrack();
      this.strokeWay = 'back';
    }
    for (let k = s.length - 1; k > i; k--) this.setSegment(edgeBetween(this.puzzle, s[k - 1], s[k]), false);
    this.render();
  }

  /** One more backtrack (a one-shot's stroke taken back), counted and logged. */
  private noteBacktrack() {
    this.backtracks++;
    this.log.note(`backtrack ${this.backtracks}`);
  }

  /**
   * One-shot mode: a drag that starts on the stroke cuts it back to there, then draws on from
   * its end. Going back onto the tile before takes the last line back; the stroke never runs
   * into itself.
   */
  private strokeStep(from: number, to: number): boolean {
    if (this.strokeDrag === 'none') return this.strokeWarning();
    const s = this.strokeCells();
    if (this.strokeDrag === 'pending') {
      const i = s.indexOf(from);
      if (i < 0) return false;
      this.cutStroke(s, i);
      s.length = i + 1;
      this.strokeDrag = 'drawing';
    }
    if (s[s.length - 1] !== from) return this.strokeWarning();
    if (s.length > 1 && to === s[s.length - 2]) {
      this.cutStroke(s, s.length - 2);
      return true;
    }
    if (s.includes(to)) return false;
    const drew = this.step(from, to);
    if (drew) this.strokeWay = 'on';
    return drew;
  }

  /** A drag that can't draw in a one-shot (not from the stroke's tip): say how to draw, once per gesture. */
  private strokeWarning(): false {
    if (!this.strokeWarned) {
      this.strokeWarned = true;
      toast('This is a one-shot level: draw from the tail to the head in one stroke, carrying on from the end of your line.');
    }
    return false;
  }

  /** Whether mistakes are highlighted as the player draws. */
  /** Whether a hint draws the move it leads to, as hints once did (otherwise it only points and explains). */
  setHintMoves(on: boolean): void {
    this.hintMoves = on;
    this.render();
  }

  setAutoCheck(on: boolean): void {
    this.autoCheck = on;
    this.render();
  }

  /** The player's marks, for saving. */
  get progress(): Progress {
    const counts = {
      ...(this.hintsUsed ? { hints: this.hintsUsed } : {}),
      ...(this.strokeMode ? { backtracks: this.backtracks } : {}),
      ...(this.caught ? { checked: true } : {}),
    };
    return { ...this.snapshot(), ...counts };
  }

  /** Solved with a gold star: no hints, no mistake shown by auto-check (and, for a one-shot, no backtracks). */
  get gold(): boolean {
    return this.solved && !this.hintsUsed && !this.caught && (!this.strokeMode || !this.backtracks);
  }

  /** One-shots: how many times the stroke has been taken back on this board. */
  get backtrackCount(): number {
    return this.backtracks;
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
    // Z or U undoes the last move; H gets a hint (like the Hint button).
    const plain = !mod && !ev.altKey && ev.key.length === 1 ? ev.key.toLowerCase() : '';
    if (plain === 'z' || plain === 'u') {
      this.undo();
      return true;
    }
    if (plain === 'h') {
      if (!this.solved) void this.showHint();
      return true;
    }
    // Solved: Enter goes on to the next level (or whatever the Next level button does).
    if (ev.key === 'Enter' && !mod && !ev.altKey && this.solved) {
      const action = this.solvedAction();
      if (!action) return false;
      action.run();
      return true;
    }
    // One-shot mode: the arrow keys (or WASD) move the stroke's head, back over the stroke to take it back.
    const step = KEY_STEPS[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
    if (!mod && !ev.altKey && step && this.strokeMode && this.puzzle.endpoints.length) {
      this.strokeKey(step[0], step[1]);
      return true;
    }
    return false;
  }

  /** One-shot mode: move the stroke's head a tile (row, column steps), or back along the stroke. */
  private strokeKey(dr: number, dc: number) {
    const s = this.strokeCells();
    const head = s[s.length - 1];
    const [r, c] = cellRC(this.puzzle, head);
    if (r + dr < 0 || c + dc < 0 || r + dr >= this.puzzle.h || c + dc >= this.puzzle.w) return;
    const to = cellAt(this.puzzle, r + dr, c + dc);
    if (s.length > 1 && to === s[s.length - 2]) this.cutStroke(s, s.length - 2);
    else if (s.includes(to) || !this.step(head, to)) return;
    else this.strokeWay = 'on';
    // (Unlike a drag, the direction is kept between key presses: going back several tiles in a row is one backtrack.)
    if (this.changed) this.afterChange();
    this.changed = false;
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
    this.log.note(`${on ? '+' : '-'}line ${edgeName(this.puzzle, e)}`);
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
    this.log.note(`${on ? '+' : '-'}X ${edgeName(this.puzzle, e)}`);
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
    this.strokeWay = null;
    // Each placement already saved its own undo step; just catch up after the gesture.
    if (this.changed) this.afterChange();
    this.changed = false;
  }

  private afterChange() {
    this.changeCount++;
    this.shownHint = this.shownHint?.kind === 'wrong' ? this.stillWrong(this.shownHint) : null;
    const wasSolved = this.solved;
    this.solved = checkSolution(this.puzzle, this.segments).solved;
    this.render();
    this.onProgress?.(this.progress, this.solved);
    // Every time the board becomes solved (e.g. again after Reset or Undo), not just the first.
    if (this.solved && !wasSolved) {
      this.log.note(`solved with ${this.hintsUsed} hint${this.hintsUsed === 1 ? '' : 's'}${this.strokeMode ? ` and ${this.backtracks} backtrack${this.backtracks === 1 ? '' : 's'}` : ''}${this.gold ? ' (gold star)' : ''}`);
      this.onSolved?.();
    }
  }

  /**
   * After a change, the wrong marks still to show: those pointed out that are still on the board,
   * until none are left. Adding a new mark ends it (the player has moved on), and so does deleting
   * one that wasn't pointed out (they're clearly fixing something else), except a one-shot's
   * lines, which come off the stroke's end on the way back to the wrong ones.
   */
  private stillWrong(h: WrongHint): WrongHint | null {
    const flaggedLines = new Set(h.lines);
    const flaggedXs = new Set(h.xs);
    const deletedLine = [...h.seen.segments].some((e) => !this.segments.has(e) && !flaggedLines.has(e));
    const deletedX = [...h.seen.xs].some((e) => !this.xMarks.has(e) && !flaggedXs.has(e));
    // (A wrong mark put back, by Undo say, is shown again rather than ending it.)
    const added =
      [...this.segments].some((e) => !h.seen.segments.has(e) && !flaggedLines.has(e)) ||
      [...this.xMarks].some((e) => !h.seen.xs.has(e) && !flaggedXs.has(e));
    if (added || (deletedLine && !this.strokeMode) || deletedX) return null;
    const lines = h.lines.filter((e) => this.segments.has(e));
    const xs = h.xs.filter((e) => this.xMarks.has(e));
    if (!lines.length && !xs.length) return null;
    const seen = { segments: new Set(this.segments), xs: new Set(this.xMarks) };
    return { ...h, edges: [...lines, ...xs], text: wrongText(lines.length, xs.length), seen };
  }

  private undo() {
    const before = this.snapshot();
    const prev = this.history.undo(before);
    if (!prev) return;
    // Undoing lines off a one-shot's stroke takes it back.
    if (this.strokeMode && prev.segments.length < this.segments.size) this.noteBacktrack();
    this.restore(prev);
    this.log.noteChange('undo', before, prev);
    this.afterChange();
  }

  private redo() {
    const before = this.snapshot();
    const next = this.history.redo(before);
    if (!next) return;
    this.restore(next);
    this.log.noteChange('redo', before, next);
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
        this.shownHint = {
          kind: 'wrong',
          lines: best.lines,
          xs: best.xs,
          edges: [...best.lines, ...best.xs],
          text: wrongText(best.lines.length, best.xs.length),
          seen: { segments: new Set(this.segments), xs: new Set(this.xMarks) },
        };
        this.hintsUsed++;
        this.log.note(`hint: wrong ${this.shownHint.edges.map((e) => edgeName(this.puzzle, e)).join(', ')}`);
        this.render();
        return;
      }
    }
    if (this.strokeMode) {
      // The next line of the stroke (or X marks that lead to it), from the stroke and the X marks.
      const { tiles, lines } = strokeFrom(this.puzzle, this.segments);
      this.shownHint = findStrokeHint(this.puzzle, lines, tiles[tiles.length - 1], {}, undefined, this.xMarks);
    } else {
      this.shownHint = findHint(this.puzzle, { segments: this.segments, xs: this.xMarks });
    }
    const h = this.shownHint;
    if (h.kind === 'deduction' || h.kind === 'mistake') this.hintsUsed++;
    this.log.note(
      h.kind === 'deduction'
        ? `hint ${h.deduction.rule}: ${[...h.deduction.segments.map((e) => `line ${edgeName(this.puzzle, e)}`), ...h.deduction.xs.map((e) => `X ${edgeName(this.puzzle, e)}`)].join(', ')}`
        : `hint (${h.kind})`,
    );
    this.render();
  }

  render(): void {
    if (!this.puzzle) return;
    const errorCells = new Set<number>();
    const errorEdges = new Set<number>(this.autoCheck ? this.autoCheckEdges() : []);
    // A mistake auto-check shows (whenever it shows one) costs the gold star, as a hint does.
    if (errorEdges.size && !this.solved) this.caught = true;
    if (this.shownHint?.kind === 'wrong') for (const e of this.shownHint.edges) errorEdges.add(e);
    // A shown hint highlights where to look and says what reasoning applies there; it doesn't
    // draw the move (that's the player's to find).
    const hint = this.shownHint;
    const d = hint?.kind === 'deduction' ? hint.deduction : null;
    // (With Hints show the move: the old way, the move drawn and the rule's full explanation.)
    const prompt = d && !this.hintMoves ? hintPrompt(this.puzzle, { segments: this.segments, xs: this.xMarks }, d) : null;
    const focus = prompt ? prompt.cells : d ? (d.cells ?? [d.cell]) : hint?.kind === 'mistake' ? (hint.cells ?? [hint.cell]) : [];
    // A One-step trial hint: the lines its supposition leads to, faintly, and where that breaks.
    // In a one-shot, only those carrying the stroke on from its head (the path from the tail)
    // (and those where it breaks; the tiles the hint is about stay green even where it breaks).
    const trial = d?.rule === 'trial' && !this.hintMoves ? trialPreview(this.puzzle, this.segments, d) : null;
      tightCoordinates: true,
    for (const c of trial?.broken ?? []) if (!focus.includes(c)) errorCells.add(c);
    const phantom = new Set(trial?.phantom ?? []);
    renderBoard(this.svg, this.puzzle, {
      pad: padFor(this.puzzle),
      segments: d && this.hintMoves ? new Set([...this.segments, ...d.segments]) : this.segments,
      xMarks: d && this.hintMoves ? new Set([...this.xMarks, ...d.xs]) : this.xMarks,
      highlight: d && this.hintMoves ? new Set([...d.segments, ...d.xs]) : undefined,
      faint: phantom.size && !this.hintMoves ? phantom : undefined,
      focusCells: focus.length ? new Set(focus) : undefined,
      errorCells,
      errorEdges,
      solved: this.solved,
      gold: this.gold,
    });

    const kind = hint ? (hint.kind === 'mistake' || hint.kind === 'wrong' ? 'error' : 'hint') : '';
    this.status.classList.toggle('error', kind === 'error');
    this.status.classList.toggle('hint', kind === 'hint');
    // Solving needs no message: the path turning green (gold for a perfect solve) says it.
    const text = prompt ? prompt.text : hint ? hint.text : '';
    this.status.textContent = text;

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
  if (!xs) return lines === 1 ? 'This line isn’t part of the solution.' : `These ${lines} lines aren’t part of the solution.`;
  if (!lines) return xs === 1 ? 'This X is on a border the path needs.' : `These ${xs} X’s are on borders the path needs.`;
  return `These marks are wrong: ${lines} ${lineText} and ${xs} ${xText}.`;
}
