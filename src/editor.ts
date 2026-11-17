import { History } from './history';
import { ICONS } from './icons';
import { attachBoardInput, type DragKind } from './input';
import {
  cellEdges,
  clonePuzzle,
  createPuzzle,
  edgeTouchesBlocked,
  MAX_SIZE,
  MIN_SIZE,
  modeOf,
  openCells,
  endTile,
  endsEqual,
  type End,
  resizePuzzle,
  type Puzzle,
} from './model';
import { padFor, renderBoard } from './render';

type Tool = 'tiles' | 'walls' | 'ends' | 'checkpoints';

const TOOL_KIND: Record<Tool, DragKind> = { tiles: 'cells', walls: 'edges', ends: 'ends', checkpoints: 'cells' };
const TOOL_HINT: Record<Tool, string> = {
  tiles: 'Tap or drag over tiles to make them black.',
  walls: 'Tap or drag along borders to add walls.',
  ends: 'Tap a tile, or a dot on the frame, to add a path end (two make a path puzzle). With no ends it is a loop.',
  checkpoints: 'Tap tiles to number them 1, 2, 3… The path must run through them in order. Tap a number to remove it.',
};

const EXCLUSIVE_NOTE = {
  ends: 'Checkpoints removed — a puzzle uses either ends or checkpoints.',
  checkpoints: 'Ends removed — a puzzle uses either ends or checkpoints.',
};

export class EditorView {
  readonly el: HTMLElement;
  /** Called after every change to the puzzle. */
  readonly changeListeners: ((p: Puzzle) => void)[] = [];
  /** Called when the user asks to play the puzzle. */
  onPlay?: () => void;

  private puzzle: Puzzle = createPuzzle(6, 6);
  private history = new History<Puzzle>();
  private tool: Tool = 'tiles';
  private ghost: Set<number> | null = null;
  private message = '';
  private messageKind: '' | 'success' | 'error' = '';

  private svg: SVGSVGElement;
  private status: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private widthSel: HTMLSelectElement;
  private heightSel: HTMLSelectElement;
  private toolBtns: Record<Tool, HTMLButtonElement>;
  /** Extra controls appended by other modules (e.g. the uniqueness check). */
  readonly actions: HTMLElement;

  // Per-gesture state.
  private before: Puzzle | null = null;
  private changed = false;
  private paintAdd = true;
  /** Message to show once the current gesture is committed. */
  private note = '';

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'view editor-view';
    const sizeOptions = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => `<option>${i + MIN_SIZE}</option>`).join('');
    this.el.innerHTML = `
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle editor board"></svg></div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="toolbar">
        <div class="toolbar-row">
          <div class="segmented" role="group" aria-label="Editing tool">
            <button class="seg-btn" data-tool="tiles">Tiles</button>
            <button class="seg-btn" data-tool="walls">Walls</button>
            <button class="seg-btn" data-tool="ends">Ends</button>
            <button class="seg-btn" data-tool="checkpoints">Checkpoints</button>
          </div>
        </div>
        <div class="toolbar-row settings-row">
          <label class="size-picker">
            <span class="sr-only">Width</span>
            <select data-size="w" aria-label="Width">${sizeOptions}</select>
            <span aria-hidden="true">×</span>
            <span class="sr-only">Height</span>
            <select data-size="h" aria-label="Height">${sizeOptions}</select>
          </label>
        </div>
        <div class="toolbar-row actions-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}</button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}</button>
          <button class="btn" data-act="clear" aria-label="Clear puzzle">${ICONS.clear}</button>
          <span class="editor-actions"></span>
          <button class="btn primary" data-act="play">${ICONS.play}<span>Play</span></button>
        </div>
      </div>`;
    this.svg = this.el.querySelector('svg')!;
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;
    this.widthSel = this.el.querySelector('[data-size=w]')!;
    this.heightSel = this.el.querySelector('[data-size=h]')!;
    this.actions = this.el.querySelector('.editor-actions')!;
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.toolBtns = {
      tiles: q('[data-tool=tiles]'),
      walls: q('[data-tool=walls]'),
      ends: q('[data-tool=ends]'),
      checkpoints: q('[data-tool=checkpoints]'),
    };

    for (const t of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[t].addEventListener('click', () => this.setTool(t));
    const onSize = () => this.edit((p) => resizePuzzle(p, +this.widthSel.value, +this.heightSel.value));
    this.widthSel.addEventListener('change', onSize);
    this.heightSel.addEventListener('change', onSize);
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    q<HTMLButtonElement>('[data-act=clear]').addEventListener('click', () =>
      this.edit((p) => createPuzzle(p.w, p.h)),
    );
    q<HTMLButtonElement>('[data-act=play]').addEventListener('click', () => this.onPlay?.());

    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => TOOL_KIND[this.tool],
      onGestureStart: () => {
        this.before = clonePuzzle(this.puzzle);
        this.changed = false;
      },
      onGestureEnd: () => this.commitGesture(),
      onPaintCell: (cell, first) => this.paintCell(cell, first),
      onTapEnd: (end) => this.toggleEnd(end),
      onPaintEdge: (e, first) => this.paintWall(e, first),
      onSecondaryEdge: (e) => this.toggleWall(e),
    });
    this.setTool('tiles');
  }

  get current(): Puzzle {
    return this.puzzle;
  }

  load(p: Puzzle): void {
    this.puzzle = clonePuzzle(p);
    this.history.clear();
    this.clearMessage();
    this.render();
    for (const fn of this.changeListeners) fn(this.puzzle);
  }

  /** Show a message under the board until the next edit. */
  setMessage(text: string, kind: '' | 'success' | 'error' = ''): void {
    this.message = text;
    this.messageKind = kind;
    this.render();
  }

  /** Overlay a solution faintly on the board until the next edit. */
  showGhost(edges: Iterable<number> | null): void {
    this.ghost = edges ? new Set(edges) : null;
    this.render();
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

  private clearMessage() {
    this.message = '';
    this.messageKind = '';
    this.ghost = null;
  }

  private setTool(t: Tool) {
    this.tool = t;
    for (const k of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[k].setAttribute('aria-pressed', String(k === t));
    this.render();
  }

  /**
   * Whether the puzzle can be played. A single end is not enough; if so, a
   * message asks for the second one.
   */
  checkPlayable(): boolean {
    if (this.puzzle.endpoints.length === 1) {
      this.setMessage('Place a second end on the frame first — a path needs an entrance and an exit.', 'error');
      return false;
    }
    if (this.puzzle.checkpoints.length === 1) {
      this.setMessage('Place a second checkpoint first — the path runs from 1 to the highest number.', 'error');
      return false;
    }
    return true;
  }

  /** Apply a whole-puzzle change as one undoable step. */
  private edit(fn: (p: Puzzle) => Puzzle) {
    this.history.push(clonePuzzle(this.puzzle));
    this.puzzle = fn(this.puzzle);
    this.afterChange();
  }

  private commitGesture() {
    if (this.changed && this.before) {
      this.history.push(this.before);
      this.afterChange();
      if (this.note) this.setMessage(this.note);
    }
    this.note = '';
    this.before = null;
    this.changed = false;
  }

  private afterChange() {
    this.clearMessage();
    this.render();
    for (const fn of this.changeListeners) fn(this.puzzle);
  }

  private undo() {
    const prev = this.history.undo(clonePuzzle(this.puzzle));
    if (!prev) return;
    this.puzzle = prev;
    this.afterChange();
  }

  private redo() {
    const next = this.history.redo(clonePuzzle(this.puzzle));
    if (!next) return;
    this.puzzle = next;
    this.afterChange();
  }

  private paintCell(cell: number, first: boolean) {
    const p = this.puzzle;
    if (this.tool === 'checkpoints') {
      if (first) this.toggleCheckpoint(cell);
      return;
    }
    if (first) this.paintAdd = !p.blocked.has(cell);
    if (this.paintAdd === p.blocked.has(cell)) return;
    if (this.paintAdd) {
      p.blocked.add(cell);
      p.endpoints = p.endpoints.filter((end) => endTile(p, end) !== cell);
      p.checkpoints = p.checkpoints.filter((c) => c !== cell);
      for (const e of cellEdges(p, cell)) {
        p.walls.delete(e);
      }
    } else {
      p.blocked.delete(cell);
    }
    this.changed = true;
    this.render();
  }

  /** Add an end (tile or frame border), or remove it if already there. Entrance is placed first. */
  private toggleEnd(end: End) {
    const p = this.puzzle;
    if (p.blocked.has(endTile(p, end))) return;
    const i = p.endpoints.findIndex((e) => endsEqual(e, end));
    if (i < 0 && p.checkpoints.length) {
      p.checkpoints = [];
      this.note = EXCLUSIVE_NOTE.ends;
    }
    if (i >= 0) p.endpoints.splice(i, 1);
    else if (p.endpoints.length < 2) p.endpoints.push(end);
    else p.endpoints[1] = end; // replace the exit
    this.changed = true;
    this.render();
  }

  /** Add the next numbered checkpoint, or remove one (later numbers move down). */
  private toggleCheckpoint(cell: number) {
    const p = this.puzzle;
    if (p.blocked.has(cell)) return;
    const i = p.checkpoints.indexOf(cell);
    if (i >= 0) p.checkpoints.splice(i, 1);
    else {
      if (p.endpoints.length) {
        p.endpoints = [];
        this.note = EXCLUSIVE_NOTE.checkpoints;
      }
      p.checkpoints.push(cell);
    }
    this.changed = true;
    this.render();
  }

  private setWall(e: number, on: boolean) {
    const p = this.puzzle;
    if (on === p.walls.has(e)) return;
    if (on) {
      // Black tiles are already walled on every side.
      if (edgeTouchesBlocked(p, e)) return;
      p.walls.add(e);
    } else {
      p.walls.delete(e);
    }
    this.changed = true;
    this.render();
  }

  private paintWall(e: number, first: boolean) {
    if (first) this.paintAdd = !this.puzzle.walls.has(e);
    this.setWall(e, this.paintAdd);
  }

  private toggleWall(e: number) {
    this.setWall(e, !this.puzzle.walls.has(e));
  }

  render(): void {
    const p = this.puzzle;
    renderBoard(this.svg, p, {
      pad: padFor(p, true),
      showBorderTargets: this.tool === 'walls',
      showPortTargets: this.tool === 'ends',
      ghost: this.ghost ?? undefined,
    });
    this.widthSel.value = String(p.w);
    this.heightSel.value = String(p.h);
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;

    this.status.classList.toggle('success', this.messageKind === 'success');
    this.status.classList.toggle('error', this.messageKind === 'error');
    if (this.message) {
      this.status.textContent = this.message;
    } else {
      const open = openCells(p).length;
      this.status.textContent = `${modeOf(p) === 'cycle' ? 'Loop' : 'Path'} · ${p.w}×${p.h} · ${open} open tiles. ${TOOL_HINT[this.tool]}`;
    }
  }
}
