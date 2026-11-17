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
import { openNewPuzzleSheet } from './new-puzzle-ui';

type Tool = 'tiles' | 'walls' | 'ends' | 'checkpoints';

/** Rules listed on their own in the Rules sheet; the rest are grouped as the easy rules. */
const ADVANCED_RULES: RuleId[] = ['bottlenecks', 'balance'];

const TOOL_KIND: Record<Tool, DragKind> = { tiles: 'cells', walls: 'edges', ends: 'ends', checkpoints: 'cells' };
const TOOL_HINT: Record<Tool, string> = {
  tiles: 'Tap or drag over tiles to make them black.',
  walls: 'Tap or drag along borders to add walls.',
  ends: 'Tap a dot on the frame to add the entrance, then the exit. With no ends or checkpoints it is a loop.',
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
  /** Called when the Save button is pressed. */
  onSave?: () => void;
  /**
   * False once the puzzle has been replaced (New puzzle), resized or turned
   * since it was loaded: the player's marks on the old one no longer mean anything.
   */
  marksStillFit = true;

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
    this.el.innerHTML = `
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle editor board"></svg></div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="toolbar">
        <div class="toolbar-row tool-row">
          <div class="segmented" role="group" aria-label="Editing tool">
            <button class="seg-btn" data-tool="tiles">Tiles</button>
            <button class="seg-btn" data-tool="walls">Walls</button>
            <button class="seg-btn" data-tool="ends">Ends</button>
            <button class="seg-btn" data-tool="checkpoints">Checkpoints</button>
          </div>
        </div>
        <div class="toolbar-row logic-row">
          <button class="btn" data-logic="rules" aria-label="Logic rules">${ICONS.list}<span>Rules</span></button>
          <button class="btn" data-logic="reset" aria-label="Reset logic">${ICONS.undo}<span>Reset</span></button>
          <button class="btn" data-logic="step" aria-label="Logic step">${ICONS.step}<span>Step</span></button>
          <span class="editor-actions"></span>
        </div>
        <div class="toolbar-row actions-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}</button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}</button>
          <button class="btn" data-act="new" aria-label="New puzzle" title="New puzzle">${ICONS.plus}</button>
          <button class="btn" data-act="save" aria-label="Save to the library" title="Save">${ICONS.save}</button>
          <button class="btn" data-act="transform" aria-label="Size, rotate and flip" title="Size, rotate and flip">${ICONS.transform}</button>
          <button class="btn primary" data-act="play">${ICONS.play}<span>Play</span></button>
        </div>
      </div>`;
    this.svg = this.el.querySelector('svg')!;
    this.status = this.el.querySelector('.status')!;
    this.undoBtn = this.el.querySelector('[data-act=undo]')!;
    this.redoBtn = this.el.querySelector('[data-act=redo]')!;
    this.actions = this.el.querySelector('.editor-actions')!;
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.toolBtns = {
      tiles: q('[data-tool=tiles]'),
      walls: q('[data-tool=walls]'),
      ends: q('[data-tool=ends]'),
      checkpoints: q('[data-tool=checkpoints]'),
    };

    for (const t of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[t].addEventListener('click', () => this.setTool(t));
    q<HTMLButtonElement>('[data-act=transform]').addEventListener('click', () => this.openTransformSheet());
    q<HTMLButtonElement>('[data-logic=step]').addEventListener('click', () => this.stepLogic());
    q<HTMLButtonElement>('[data-logic=reset]').addEventListener('click', () => {
      this.resetLogic();
      this.clearMessage();
      this.render();
    });
    q<HTMLButtonElement>('[data-logic=rules]').addEventListener('click', () => this.openRulesSheet());
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    q<HTMLButtonElement>('[data-act=new]').addEventListener('click', () =>
      openNewPuzzleSheet({
        storage: this.storage,
        w: this.puzzle.w,
        h: this.puzzle.h,
        onBlank: (w, h) => {
          this.marksStillFit = false;
          this.edit(() => createPuzzle(w, h));
        },
        onGenerated: (p, { options, difficulty }) => {
          this.marksStillFit = false;
          this.edit(() => p);
          const kind = { loop: 'loop', path: 'path', checkpoints: 'numbers' }[options.type];
          const note = difficulty === options.difficulty ? '' : ` (no ${options.difficulty} one turned up, so this is the closest)`;
          this.setMessage(`Generated a ${difficulty} ${kind} puzzle${note} · seed ${options.seed}`, 'success');
        },
      }),
    );
    q<HTMLButtonElement>('[data-act=save]').addEventListener('click', () => this.onSave?.());
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

  /** The logic helper's lines and X marks, if it has taken any steps on this puzzle. */
  get logicMarks(): { segments: number[]; xMarks: number[] } | null {
    if (!this.logicSteps) return null;
    return { segments: [...this.logic.segments], xMarks: [...this.logic.xs] };
  }

  load(p: Puzzle): void {
    this.puzzle = clonePuzzle(p);
    this.marksStillFit = true;
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

  /** Grid size, rotate and flip, in one sheet that stays open while you try things. */
  private openTransformSheet() {
    const body = document.createElement('div');
    body.className = 'sheet-stack transform-sheet';
    const sizeOptions = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => `<option>${i + MIN_SIZE}</option>`).join('');
    const size = document.createElement('label');
    size.className = 'size-picker';
    size.innerHTML = `<select aria-label="Width">${sizeOptions}</select><span aria-hidden="true">×</span><select aria-label="Height">${sizeOptions}</select>`;
    const [w, h] = size.querySelectorAll('select');
    const sync = () => {
      w.value = String(this.puzzle.w);
      h.value = String(this.puzzle.h);
    };
    sync();
    const resize = () => {
      this.marksStillFit = false;
      this.edit((p) => resizePuzzle(p, +w.value, +h.value));
    };
    w.addEventListener('change', resize);
    h.addEventListener('change', resize);
    const label = document.createElement('p');
    label.className = 'field-label';
    label.textContent = 'Size (width × height)';
    body.append(label, size);

    const turns: [Transform, string, string][] = [
      ['rotateLeft', ICONS.rotateLeft, 'Rotate left'],
      ['rotateRight', ICONS.rotateRight, 'Rotate right'],
      ['flipH', ICONS.flipH, 'Flip left–right'],
      ['flipV', ICONS.flipV, 'Flip up–down'],
    ];
    const grid = document.createElement('div');
    grid.className = 'transform-grid';
    for (const [t, icon, text] of turns) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = `${icon}<span>${text}</span>`;
      b.addEventListener('click', () => {
        this.marksStillFit = false;
        this.edit((p) => transformPuzzle(p, t));
        sync(); // a quarter turn swaps width and height
      });
      grid.append(b);
    }
    body.append(grid);
    openSheet('Size, rotate and flip', body);
  }

  /** Whether the easy rules are listed one by one in the Rules sheet. */
  private easyRulesExpanded = false;

  private openRulesSheet() {
    const body = document.createElement('div');
    body.className = 'sheet-stack';
    const save = () => this.storage.saveLogicRules({ enabled: [...this.logicRules], known: ALL_RULES });

    const switchRow = (label: string, hint: string | HTMLElement, checked: boolean, onChange: (on: boolean) => void, cls = '') => {
      const row = document.createElement('label');
      row.className = `switch-row ${cls}`.trim();
      const text = document.createElement('span');
      text.className = 'switch-text';
      const small = document.createElement('small');
      small.append(hint);
      text.append(document.createTextNode(label), small);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.setAttribute('role', 'switch');
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      row.append(text, input);
      body.append(row);
      return input;
    };

    const render = () => {
      body.replaceChildren();
      // Only the rules that can apply to this puzzle (e.g. Number order needs checkpoints).
      const rules = rulesFor(this.puzzle);
      const easy = rules.filter((r) => !ADVANCED_RULES.includes(r.id));
      const advanced = rules.filter((r) => ADVANCED_RULES.includes(r.id));

      const onCount = easy.filter((r) => this.logicRules.has(r.id)).length;
      const hint = document.createElement('span');
      hint.textContent = `${easy.map((r) => r.label).join(', ')}. `;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'link-btn';
      toggle.textContent = this.easyRulesExpanded ? 'Group them again' : 'Choose them one by one';
      toggle.addEventListener('click', (ev) => {
        ev.preventDefault(); // don't flip the switch this link sits in
        this.easyRulesExpanded = !this.easyRulesExpanded;
        render();
      });
      hint.append(toggle);
      const group = switchRow('Easy rules', hint, onCount === easy.length, (on) => {
        for (const r of easy) on ? this.logicRules.add(r.id) : this.logicRules.delete(r.id);
        save();
        render();
      });
      group.indeterminate = onCount > 0 && onCount < easy.length;

      if (this.easyRulesExpanded) {
        for (const r of easy) {
          switchRow(
            r.label,
            r.hint,
            this.logicRules.has(r.id),
            (on) => {
              on ? this.logicRules.add(r.id) : this.logicRules.delete(r.id);
              save();
              render();
            },
            'sub-rule',
          );
        }
      }
      for (const r of advanced) {
        switchRow(r.label, r.hint, this.logicRules.has(r.id), (on) => {
          on ? this.logicRules.add(r.id) : this.logicRules.delete(r.id);
          save();
        });
      }
    };
    render();
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
    // The logic helper's marks show until the next edit.
    const logic = this.logicSteps > 0 || this.logicBad.length > 0;
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
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;

    this.status.classList.toggle('success', this.messageKind === 'success');
    this.status.classList.toggle('error', this.messageKind === 'error');
    if (this.message) {
      this.status.textContent = this.message;
    } else {
      const open = openCells(p).length;
      this.status.textContent = this.logicNote || `${modeOf(p) === 'cycle' ? 'Loop' : 'Path'} · ${p.w}×${p.h} · ${open} open tiles. ${TOOL_HINT[this.tool]}`;
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
