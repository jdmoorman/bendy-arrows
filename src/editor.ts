import { History } from './history';
import { ICONS } from './icons';
import { attachBoardInput, type DragKind } from './input';
import {
  cellEdges,
  clonePuzzle,
  createPuzzle,
  edgeBetween,
  MAX_SIZE,
  MIN_SIZE,
  openCells,
  resizePuzzle,
  type Mode,
  type Puzzle,
} from './model';
import { renderBoard } from './render';
import { canPlace } from './rules';

type Tool = 'tiles' | 'walls' | 'ends' | 'givens';

const TOOL_KIND: Record<Tool, DragKind> = { tiles: 'cells', walls: 'edges', ends: 'cells', givens: 'path' };
const TOOL_HINT: Record<Tool, string> = {
  tiles: 'Tap or drag over tiles to make them black.',
  walls: 'Tap or drag along borders to add walls.',
  ends: 'Tap tiles to mark where the path must end (up to two).',
  givens: 'Drag between tiles to give segments of the solution.',
};

export class EditorView {
  readonly el: HTMLElement;
  /** Called after every change to the puzzle. */
  onChange?: (p: Puzzle) => void;
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
  private modeBtns: Record<Mode, HTMLButtonElement>;
  /** Extra controls appended by other modules (e.g. the uniqueness check). */
  readonly actions: HTMLElement;

  // Per-gesture state.
  private before: Puzzle | null = null;
  private changed = false;
  private paintAdd = true;
  private trail: number[] = [];

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
            <button class="seg-btn" data-tool="givens">Givens</button>
          </div>
        </div>
        <div class="toolbar-row settings-row">
          <div class="segmented mode-switch" role="group" aria-label="Puzzle type">
            <button class="seg-btn" data-mode="path">Path</button>
            <button class="seg-btn" data-mode="cycle">Loop</button>
          </div>
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
      givens: q('[data-tool=givens]'),
    };
    this.modeBtns = { path: q('[data-mode=path]'), cycle: q('[data-mode=cycle]') };

    for (const t of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[t].addEventListener('click', () => this.setTool(t));
    for (const m of Object.keys(this.modeBtns) as Mode[]) this.modeBtns[m].addEventListener('click', () => this.setMode(m));
    const onSize = () => this.edit((p) => resizePuzzle(p, +this.widthSel.value, +this.heightSel.value));
    this.widthSel.addEventListener('change', onSize);
    this.heightSel.addEventListener('change', onSize);
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    q<HTMLButtonElement>('[data-act=clear]').addEventListener('click', () =>
      this.edit((p) => createPuzzle(p.w, p.h, p.mode)),
    );
    q<HTMLButtonElement>('[data-act=play]').addEventListener('click', () => this.onPlay?.());

    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => TOOL_KIND[this.tool],
      onGestureStart: () => {
        this.before = clonePuzzle(this.puzzle);
        this.changed = false;
        this.trail = [];
      },
      onGestureEnd: () => this.commitGesture(),
      onPaintCell: (cell, first) => this.paintCell(cell, first),
      onPaintEdge: (e, first) => this.paintWall(e, first),
      onPathStart: (cell) => {
        this.trail = [cell];
      },
      onStep: (from, to) => this.stepGiven(from, to),
      onTapEdge: (e) => this.toggleGiven(e),
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
    if (t === 'ends' && this.puzzle.mode === 'cycle') t = 'tiles';
    this.tool = t;
    for (const k of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[k].setAttribute('aria-pressed', String(k === t));
    this.render();
  }

  private setMode(m: Mode) {
    if (m === this.puzzle.mode) return;
    this.edit((p) => {
      const q = clonePuzzle(p);
      q.mode = m;
      if (m === 'cycle') q.endpoints = [];
      return q;
    });
    if (m === 'cycle' && this.tool === 'ends') this.setTool('tiles');
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
    }
    this.before = null;
    this.changed = false;
  }

  private afterChange() {
    this.clearMessage();
    this.render();
    this.onChange?.(this.puzzle);
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
    if (this.tool === 'ends') {
      if (!first || p.mode !== 'path' || p.blocked.has(cell)) return;
      const i = p.endpoints.indexOf(cell);
      if (i >= 0) p.endpoints.splice(i, 1);
      else {
        p.endpoints.push(cell);
        if (p.endpoints.length > 2) p.endpoints.shift();
      }
      this.changed = true;
      this.render();
      return;
    }
    if (first) this.paintAdd = !p.blocked.has(cell);
    if (this.paintAdd === p.blocked.has(cell)) return;
    if (this.paintAdd) {
      p.blocked.add(cell);
      p.endpoints = p.endpoints.filter((c) => c !== cell);
      for (const e of cellEdges(p, cell)) p.givens.delete(e);
    } else {
      p.blocked.delete(cell);
    }
    this.changed = true;
    this.render();
  }

  private setWall(e: number, on: boolean) {
    const p = this.puzzle;
    if (on === p.walls.has(e)) return;
    if (on) {
      p.walls.add(e);
      p.givens.delete(e);
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

  private setGiven(e: number, on: boolean) {
    const p = this.puzzle;
    if (on === p.givens.has(e)) return;
    if (on) {
      if (!canPlace(p, e)) return;
      p.givens.add(e);
    } else {
      p.givens.delete(e);
    }
    this.changed = true;
    this.render();
  }

  private toggleGiven(e: number) {
    this.setGiven(e, !this.puzzle.givens.has(e));
  }

  private stepGiven(from: number, to: number): boolean {
    const e = edgeBetween(this.puzzle, from, to);
    if (e < 0 || !canPlace(this.puzzle, e)) return false;
    const t = this.trail;
    if (t.length >= 2 && t[t.length - 2] === to) {
      this.setGiven(e, false);
      t.pop();
    } else {
      this.setGiven(e, true);
      t.push(to);
    }
    return true;
  }

  render(): void {
    const p = this.puzzle;
    renderBoard(this.svg, p, {
      showBorderTargets: this.tool === 'walls',
      ghost: this.ghost ?? undefined,
    });
    for (const m of Object.keys(this.modeBtns) as Mode[]) this.modeBtns[m].setAttribute('aria-pressed', String(m === p.mode));
    this.toolBtns.ends.disabled = p.mode === 'cycle';
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
      this.status.textContent = `${p.mode === 'cycle' ? 'Loop' : 'Path'} · ${p.w}×${p.h} · ${open} open tiles. ${TOOL_HINT[this.tool]}`;
    }
  }
}
