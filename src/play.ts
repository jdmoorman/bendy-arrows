import { History } from './history';
import { ICONS } from './icons';
import { attachBoardInput } from './input';
import { cellEdges, edgeBetween, isUsableEdge, modeOf, type Puzzle } from './model';
import { padFor, renderBoard } from './render';
import { canPlace, checkSolution, type CheckResult } from './rules';

export interface Progress {
  segments: number[];
  xMarks: number[];
}

/** Describe the puzzle's fixed ends for the hint line. */
function endsHint(p: Puzzle): string {
  return p.endpoints.length > 1 ? 'enter and leave at the arrows' : 'end at the arrow';
}

export class PlayView {
  readonly el: HTMLElement;
  /** Called after every change to the player's marks. */
  onProgress?: (progress: Progress, solved: boolean) => void;

  private puzzle!: Puzzle;
  private segments = new Set<number>();
  private xMarks = new Set<number>();
  private history = new History<Progress>();
  /** Full check result shown after pressing Check, until the next change. */
  private shownCheck: CheckResult | null = null;
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
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle board"></svg></div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="toolbar">
        <div class="toolbar-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}</button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}</button>
          <button class="btn" data-act="clear" aria-label="Clear">${ICONS.clear}<span>Clear</span></button>
          <button class="btn primary" data-act="check">${ICONS.check}<span>Check</span></button>
        </div>
      </div>`;
    this.svg = this.el.querySelector('svg')!;
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;

    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    this.el.querySelector('[data-act=clear]')!.addEventListener('click', () => this.clear());
    this.el.querySelector('[data-act=check]')!.addEventListener('click', () => this.check());

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
    this.shownCheck = null;
    this.solved = checkSolution(p, this.segments).solved;
    this.render();
  }

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

  private afterChange() {
    this.shownCheck = null;
    const wasSolved = this.solved;
    this.solved = checkSolution(this.puzzle, this.segments).solved;
    if (this.solved && !wasSolved) navigator.vibrate?.([30, 60, 30]);
    this.render();
    this.onProgress?.(this.snapshot(), this.solved);
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

  private clear() {
    if (!this.segments.size && !this.xMarks.size) return;
    this.history.push(this.snapshot());
    this.segments.clear();
    this.xMarks.clear();
    this.afterChange();
  }

  private check() {
    this.shownCheck = checkSolution(this.puzzle, this.segments);
    this.render();
  }

  render(): void {
    if (!this.puzzle) return;
    const live = checkSolution(this.puzzle, this.segments);
    const full = this.shownCheck;
    const errorCells = new Set<number>([...live.branches, ...live.checkpointErrors]);
    const errorEdges = new Set<number>([...live.loopEdges, ...live.illegalEdges]);
    if (full) {
      for (const c of full.unvisited) errorCells.add(c);
      for (const c of full.badEnds) errorCells.add(c);
    }
    renderBoard(this.svg, this.puzzle, {
      pad: padFor(this.puzzle),
      segments: this.segments,
      xMarks: this.xMarks,
      errorCells,
      errorEdges,
      solved: live.solved,
    });

    this.status.classList.toggle('success', live.solved);
    this.status.classList.toggle('error', !live.solved && !!full);
    if (live.solved) this.status.textContent = live.message;
    else if (full) this.status.textContent = full.message;
    else this.status.textContent = this.hint();

    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
  }

  private hint(): string {
    const p = this.puzzle;
    const goal = modeOf(p) === 'cycle' ? 'Draw one loop through every open tile.' : 'Draw one path through every open tile.';
    const n = p.checkpoints.length;
    const ends = n
      ? ` Pass through the numbers in order, from 1 to ${n}.`
      : p.endpoints.length
        ? ` The path must ${endsHint(p)}.`
        : '';
    return goal + ends + ' Tap a line or a tile to erase; tap an empty border for an X.';
  }
}
