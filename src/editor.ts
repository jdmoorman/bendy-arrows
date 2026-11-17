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
  endpointCells,
  openCells,
  endTile,
  endsEqual,
  type End,
  resizePuzzle,
  transformPuzzle,
  type Transform,
  type Puzzle,
} from './model';
import { padFor, renderBoard } from './render';
import { ALL_RULES, applyStep, BASIC_RULES, logicStep, RULES, rulesFor, type LogicState, type RuleId } from './logic';
import { Storage } from './storage';
import { openSheet } from './ui';

type Tool = 'tiles' | 'walls' | 'ends' | 'checkpoints' | 'logic';

const TOOL_KIND: Record<Tool, DragKind> = { tiles: 'cells', walls: 'edges', ends: 'ends', checkpoints: 'cells', logic: 'cells' };
const TOOL_HINT: Record<Tool, string> = {
  tiles: 'Tap or drag over tiles to make them black.',
  walls: 'Tap or drag along borders to add walls.',
  ends: 'Tap a dot on the frame to add the entrance, then the exit. With no ends or checkpoints it is a loop.',
  checkpoints: 'Tap tiles to number them 1, 2, 3… The path must run through them in order. Tap a number to remove it.',
  logic: 'Press Step to apply one round of the chosen simple rules. Press again to keep going.',
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

  // Logic helper state: deductions so far, the latest step's marks, and the chosen rules.
  private storage = new Storage();
  private logic: LogicState = { segments: new Set(), xs: new Set() };
  private logicFresh = new Set<number>();
  private logicSteps = 0;
  private logicBad: number[] = [];
  private logicNote = '';
  private logicRules = loadRuleChoice(new Storage());

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
            <button class="seg-btn" data-tool="logic">Logic</button>
          </div>
        </div>
        <div class="toolbar-row logic-row hidden">
          <button class="btn" data-logic="rules">${ICONS.list}<span>Rules</span></button>
          <button class="btn" data-logic="reset">${ICONS.undo}<span>Reset</span></button>
          <button class="btn primary" data-logic="step">${ICONS.step}<span>Step</span></button>
        </div>
        <div class="toolbar-row settings-row">
          <label class="size-picker">
            <span class="sr-only">Width</span>
            <select data-size="w" aria-label="Width">${sizeOptions}</select>
            <span aria-hidden="true">×</span>
            <span class="sr-only">Height</span>
            <select data-size="h" aria-label="Height">${sizeOptions}</select>
          </label>
          <button class="btn icon-only" data-transform="rotateLeft" aria-label="Rotate left" title="Rotate left">${ICONS.rotateLeft}</button>
          <button class="btn icon-only" data-transform="rotateRight" aria-label="Rotate right" title="Rotate right">${ICONS.rotateRight}</button>
          <button class="btn icon-only" data-transform="flipH" aria-label="Flip horizontally" title="Flip horizontally">${ICONS.flipH}</button>
          <button class="btn icon-only" data-transform="flipV" aria-label="Flip vertically" title="Flip vertically">${ICONS.flipV}</button>
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
      logic: q('[data-tool=logic]'),
    };

    for (const t of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[t].addEventListener('click', () => this.setTool(t));
    const onSize = () => this.edit((p) => resizePuzzle(p, +this.widthSel.value, +this.heightSel.value));
    this.widthSel.addEventListener('change', onSize);
    this.heightSel.addEventListener('change', onSize);
    q<HTMLButtonElement>('[data-logic=step]').addEventListener('click', () => this.stepLogic());
    q<HTMLButtonElement>('[data-logic=reset]').addEventListener('click', () => {
      this.resetLogic();
      this.clearMessage();
      this.render();
    });
    q<HTMLButtonElement>('[data-logic=rules]').addEventListener('click', () => this.openRulesSheet());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-transform]')) {
      b.addEventListener('click', () => this.edit((p) => transformPuzzle(p, b.dataset.transform as Transform)));
    }
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
    this.resetLogic();
    this.history.clear();
    this.clearMessage();
    this.render();
    for (const fn of this.changeListeners) fn(this.puzzle);
  }

  // --- Logic helper -------------------------------------------------------

  private resetLogic() {
    this.logic = { segments: new Set(), xs: new Set() };
    this.logicFresh = new Set();
    this.logicSteps = 0;
    this.logicBad = [];
    this.logicNote = '';
  }

  private stepLogic() {
    this.clearMessage();
    const p = this.puzzle;
    if (modeOf(p) === 'path' && endpointCells(p).length < 2) {
      this.logicNote = 'Place both ends (or at least two checkpoints) first.';
      this.render();
      return;
    }
    const step = logicStep(p, this.logic, this.logicRules);
    this.logicBad = step.contradiction ? (step.contradiction.cells ?? [step.contradiction.cell]) : [];
    if (step.contradiction) {
      this.logicFresh = new Set();
      this.setMessage(`Contradiction: ${step.contradiction.reason} This puzzle has no solution.`, 'error');
      return;
    }
    if (step.solved) {
      this.logicFresh = new Set();
      this.setMessage(`Solved by simple logic in ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'}!`, 'success');
      return;
    }
    if (!step.segments.length && !step.xs.length) {
      this.logicFresh = new Set();
      this.logicNote = this.logicSteps
        ? `Stuck after ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'} — the chosen rules find nothing more.`
        : 'The chosen rules find nothing to fill in.';
      this.render();
      return;
    }
    this.logic = applyStep(this.logic, step);
    this.logicFresh = new Set([...step.segments, ...step.xs]);
    this.logicSteps++;
    const parts = RULES.filter((r) => step.byRule[r.id]).map((r) => `${r.label.toLowerCase()} ${step.byRule[r.id]}`);
    const lines = step.segments.length ? `+${step.segments.length} line${step.segments.length === 1 ? '' : 's'}` : '';
    const xs = step.xs.length ? `+${step.xs.length} X` : '';
    this.logicNote = `Step ${this.logicSteps}: ${[lines, xs].filter(Boolean).join(', ')} (${parts.join(', ')}).`;
    this.render();
  }

  private openRulesSheet() {
    const body = document.createElement('div');
    body.className = 'sheet-stack';
    // Only the rules that can apply to this puzzle (e.g. Number order needs checkpoints).
    for (const r of rulesFor(this.puzzle)) {
      const row = document.createElement('label');
      row.className = 'switch-row';
      const text = document.createElement('span');
      text.className = 'switch-text';
      const small = document.createElement('small');
      small.textContent = r.hint;
      text.append(document.createTextNode(r.label), small);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.setAttribute('role', 'switch');
      input.checked = this.logicRules.has(r.id);
      input.addEventListener('change', () => {
        if (input.checked) this.logicRules.add(r.id);
        else this.logicRules.delete(r.id);
        this.storage.saveLogicRules({ enabled: [...this.logicRules], known: ALL_RULES });
      });
      row.append(text, input);
      body.append(row);
    }
    openSheet('Logic rules', body);
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
    this.el.querySelector('.settings-row')!.classList.toggle('hidden', t === 'logic');
    this.el.querySelector('.logic-row')!.classList.toggle('hidden', t !== 'logic');
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
    this.resetLogic();
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
    if (this.tool === 'logic') return; // the board is read-only while using the logic helper
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
    const logic = this.tool === 'logic';
    renderBoard(this.svg, p, {
      pad: padFor(p, true),
      showBorderTargets: this.tool === 'walls',
      showPortTargets: this.tool === 'ends',
      ghost: this.ghost ?? undefined,
      segments: logic ? this.logic.segments : undefined,
      xMarks: logic ? this.logic.xs : undefined,
      highlight: logic ? this.logicFresh : undefined,
      errorCells: logic && this.logicBad.length ? new Set(this.logicBad) : undefined,
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
      if (logic && this.logicNote) this.status.textContent = this.logicNote;
    }
  }
}

/**
 * The saved rule choices. Rules added since the choice was saved start on;
 * a choice saved before the list was recorded knew only the basic rules.
 */
function loadRuleChoice(storage: Storage): Set<RuleId> {
  const saved = storage.loadLogicRules();
  if (!saved) return new Set(ALL_RULES);
  const known = new Set<string>(saved.known ?? BASIC_RULES);
  const on = new Set<string>(saved.enabled);
  return new Set(ALL_RULES.filter((r) => on.has(r) || !known.has(r)));
}
