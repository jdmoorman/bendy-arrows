import { encodePuzzle } from './codec';
import { History } from './history';
import { ICONS } from './icons';
import { attachBoardInput, type DragKind } from './input';
import {
  cellEdges,
  edgeCells,
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
import { ADVANCED_RULES, ALL_RULES, applyStep, AREA_SOURCES, BASIC_RULES, findHint, RULES, rulesFor, runLogic, type AreaSource, type LogicOptions, type LogicState, type RuleId } from './logic';
import type { LogicReply, LogicRequest } from './logic.worker';
import { Storage } from './storage';
import { openSheet } from './ui';
import { openBlankPuzzleSheet, openGeneratorSheet, type NewPuzzleContext } from './new-puzzle-ui';

type Tool = 'tiles' | 'walls' | 'ends' | 'checkpoints';

/** Rules listed on their own in the Rules sheet; the rest are grouped as the easy rules. */

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
  private suggestedWall: number | null = null;
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
  /** The area the latest step is about. */
  private logicFocus = new Set<number>();
  /** The logic state before each step (or fast forward), for stepping back. */
  private logicHistory: { logic: LogicState; steps: number }[] = [];
  private logicBackBtn!: HTMLButtonElement;
  private logicNote = '';
  private logicRules = loadRuleChoice(new Storage());
  /** Apply the chosen rules after every change, until they get stuck. */
  private autoLogic = new Storage().loadLogicRules()?.auto === true;
  /** Logic engine options: whether rooms stop growing at a tie. */
  private logicOpts: LogicOptions = loadLogicOptions(new Storage());
  private autoWorker: Worker | null = null;
  private autoId = 0;

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
          <button class="btn icon-only" data-logic="reset" aria-label="Reset logic" title="Reset logic">${ICONS.rotateLeft}</button>
          <button class="btn icon-only" data-logic="back" aria-label="Undo the last logic step" title="Undo the last logic step">${ICONS.stepBack}</button>
          <button class="btn icon-only" data-logic="step" aria-label="Logic step" title="Logic step">${ICONS.step}</button>
          <button class="btn icon-only" data-logic="fast" aria-label="Apply easy rules until stuck" title="Apply easy rules until stuck">${ICONS.fastForward}</button>
          <span class="editor-actions"></span>
        </div>
        <div class="toolbar-row actions-row">
          <button class="btn" data-act="undo" aria-label="Undo">${ICONS.undo}</button>
          <button class="btn" data-act="redo" aria-label="Redo">${ICONS.redo}</button>
          <button class="btn" data-act="new" aria-label="New blank puzzle" title="New blank puzzle">${ICONS.plus}</button>
          <button class="btn" data-act="generate" aria-label="Generate a puzzle" title="Generate a puzzle">${ICONS.dice}</button>
          <button class="btn" data-act="save" aria-label="Save to the library" title="Save">${ICONS.save}</button>
          <button class="btn" data-act="transform" aria-label="Size, rotate and flip" title="Size, rotate and flip">${ICONS.transform}</button>
          <button class="btn primary" data-act="play">${ICONS.play}<span>Play</span></button>
        </div>
      </div>
      <div class="board-info"></div>`;
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
    this.logicBackBtn = q<HTMLButtonElement>('[data-logic=back]');
    this.logicBackBtn.addEventListener('click', () => this.stepLogicBack());
    q<HTMLButtonElement>('[data-logic=fast]').addEventListener('click', () => this.fastForwardLogic());
    q<HTMLButtonElement>('[data-logic=reset]').addEventListener('click', () => {
      this.cancelAutoLogic();
      this.resetLogic();
      this.clearMessage();
      this.render();
    });
    q<HTMLButtonElement>('[data-logic=rules]').addEventListener('click', () => this.openRulesSheet());
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    const newPuzzle = (): NewPuzzleContext => ({
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
        const kind = { path: 'path', checkpoints: 'numbers' }[options.type];
        const word = (d: string) => (d === 'veryhard' ? 'very hard' : d);
        const note =
          options.difficulty === 'any' || difficulty === options.difficulty ? '' : ` (no ${word(options.difficulty)} one turned up, so this is the closest)`;
        const obstacles = p.walls.size + p.blocked.size;
        this.setMessage(
          `Generated ${difficulty === 'easy' ? 'an' : 'a'} ${word(difficulty)} ${kind} puzzle with ${obstacles} obstacle${obstacles === 1 ? '' : 's'}${note} · seed ${options.seed}`,
          'success',
        );
      },
    });
    q<HTMLButtonElement>('[data-act=new]').addEventListener('click', () => openBlankPuzzleSheet(newPuzzle()));
    q<HTMLButtonElement>('[data-act=generate]').addEventListener('click', () => openGeneratorSheet(newPuzzle()));
    q<HTMLButtonElement>('[data-act=save]').addEventListener('click', () => this.onSave?.());
    q<HTMLButtonElement>('[data-act=play]').addEventListener('click', () => this.onPlay?.());

    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => TOOL_KIND[this.tool],
      onGestureStart: () => {
        this.changed = false;
      },
      onGestureEnd: () => this.commitGesture(),
      onPaintCell: (cell, first) => this.paintCell(cell, first),
      onTapEnd: (end) => this.toggleEnd(end),
      onPaintEdge: (e, first, cell) => this.paintWall(e, first, cell),
      // Erasing walls also clears black tiles; erasing black tiles also clears walls.
      onStrokeCell: (cell) => {
        if (this.tool === 'walls' && !this.paintAdd) this.clearBlack(cell);
      },
      onStrokeEdge: (e) => {
        if (this.tool === 'tiles' && !this.paintAdd && this.puzzle.walls.has(e)) this.setWall(e, false);
      },
      strokeErases: () => !this.paintAdd,
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
    if (this.autoLogic) this.runAutoLogic();
    for (const fn of this.changeListeners) fn(this.puzzle);
  }

  // --- Logic helper -------------------------------------------------------

  private resetLogic() {
    this.logic = { segments: new Set(), xs: new Set() };
    this.logicFresh = new Set();
    this.logicSteps = 0;
    this.logicBad = [];
    this.logicFocus = new Set();
    this.logicHistory = [];
    this.logicNote = '';
  }

  private stepLogic() {
    this.cancelAutoLogic();
    this.clearMessage();
    const p = this.puzzle;
    if (modeOf(p) === 'path' && endpointCells(p).length < 2) {
      this.logicNote = 'Place both ends (or at least two checkpoints) first.';
      this.render();
      return;
    }
    // One step is exactly what a Play hint would suggest, using the chosen rules.
    const hint = findHint(p, this.logic, this.logicRules, this.logicOpts);
    this.logicFresh = new Set();
    this.logicFocus = new Set();
    this.logicBad = hint.kind === 'mistake' ? (hint.cells ?? [hint.cell]) : [];
    if (hint.kind === 'mistake') {
      this.setMessage(`Contradiction: ${hint.text} This puzzle has no solution.`, 'error');
      return;
    }
    if (hint.kind === 'solved') {
      this.setMessage(`Solved by logic in ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'}!`, 'success');
      return;
    }
    if (hint.kind === 'none') {
      this.logicNote = this.logicSteps
        ? `Stuck after ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'} — the chosen rules find nothing more.`
        : 'The chosen rules find nothing to fill in.';
      this.render();
      return;
    }
    const d = hint.deduction;
    this.logicHistory.push({ logic: this.logic, steps: this.logicSteps });
    this.logic = applyStep(this.logic, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
    this.logicFresh = new Set([...d.segments, ...d.xs]);
    this.logicFocus = new Set(d.cells ?? [d.cell]);
    this.logicSteps++;
    const label = RULES.find((r) => r.id === d.rule)?.label ?? d.rule;
    this.logicNote = `Step ${this.logicSteps} · ${label}`;
    this.render();
  }

  /** Take hint-sized steps with the chosen easy rules until they find nothing more. */
  private fastForwardLogic() {
    this.cancelAutoLogic();
    const p = this.puzzle;
    if (modeOf(p) === 'path' && endpointCells(p).length < 2) {
      this.clearMessage();
      this.logicNote = 'Place both ends (or at least two checkpoints) first.';
      this.render();
      return;
    }
    const rules = [...this.logicRules].filter((r) => !ADVANCED_RULES.includes(r));
    const before = { logic: this.logic, steps: this.logicSteps };
    // Speed matters here, not the order a hint would pick: run the easy rules to the end.
    const run = runLogic(p, rules, this.logic, this.logicOpts);
    const fresh = new Set([...run.state.segments, ...run.state.xs].filter((e) => !this.logic.segments.has(e) && !this.logic.xs.has(e)));
    const lines = [...run.state.segments].filter((e) => !this.logic.segments.has(e)).length;
    const xs = fresh.size - lines;
    if (fresh.size) {
      // The whole fast forward counts as one step, so Back undoes it in one go.
      this.logicHistory.push(before);
      this.logic = run.state;
      this.logicSteps++;
    }
    this.clearMessage();
    this.logicFresh = fresh;
    this.logicFocus = new Set();
    const c = run.contradiction;
    this.logicBad = c ? (c.cells ?? [c.cell]) : [];
    const added = [lines ? `+${lines} line${lines === 1 ? '' : 's'}` : '', xs ? `+${xs} X` : ''].filter(Boolean).join(', ');
    if (c) this.setMessage(`Contradiction: ${c.reason} This puzzle has no solution.`, 'error');
    else if (run.solved) this.setMessage(`Fast forward: ${added ? added + ', and ' : ''}the easy rules solve it!`, 'success');
    else {
      this.logicNote = fresh.size ? `Fast forward: ${added}. The easy rules find nothing more.` : 'The easy rules find nothing more.';
      this.render();
    }
  }

  /** Run the chosen rules to the end in a worker, replacing any run still going. */
  private runAutoLogic() {
    const p = this.puzzle;
    this.cancelAutoLogic();
    if (modeOf(p) === 'path' && endpointCells(p).length < 2) return;
    const id = ++this.autoId;
    this.autoWorker = new Worker(new URL('./logic.worker.ts', import.meta.url), { type: 'module' });
    this.autoWorker.onmessage = (ev: MessageEvent<LogicReply>) => {
      const r = ev.data;
      if (r.id !== this.autoId) return;
      this.cancelAutoLogic();
      this.clearMessage();
      this.resetLogic();
      this.logic = { segments: new Set(r.segments), xs: new Set(r.xs) };
      // Count the automatic run as one step, so Back clears it and Step carries on from it.
      if (r.segments.length || r.xs.length) {
        this.logicHistory.push({ logic: { segments: new Set(), xs: new Set() }, steps: 0 });
        this.logicSteps = 1;
      }
      if (r.contradiction) {
        this.logicBad = r.contradiction.cells ?? [r.contradiction.cell];
        this.setMessage(`Contradiction: ${r.contradiction.reason} This puzzle has no solution.`, 'error');
        return;
      }
      if (r.solved) {
        this.setMessage('Auto-apply: the chosen rules solve it.', 'success');
        return;
      }
      this.logicNote = r.segments.length || r.xs.length ? 'Auto-apply: the chosen rules get this far, then get stuck.' : 'Auto-apply: the chosen rules find nothing to fill in.';
      this.render();
    };
    this.autoWorker.postMessage({ id, code: encodePuzzle(p), rules: [...this.logicRules], opts: this.logicOpts } satisfies LogicRequest);
  }

  private cancelAutoLogic() {
    this.autoWorker?.terminate();
    this.autoWorker = null;
  }

  private stepLogicBack() {
    this.cancelAutoLogic();
    const prev = this.logicHistory.pop();
    if (!prev) return;
    this.clearMessage();
    this.logic = prev.logic;
    this.logicSteps = prev.steps;
    this.logicFresh = new Set();
    this.logicFocus = new Set();
    this.logicBad = [];
    this.logicNote = this.logicSteps ? `Back to step ${this.logicSteps}.` : 'Back to the start.';
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
    const save = () => {
      this.storage.saveLogicRules({
        enabled: [...this.logicRules],
        known: ALL_RULES,
        auto: this.autoLogic,
        // Saved as the ones switched off, so a newly added kind of area starts on.
        areaSourcesOff: AREA_SOURCES.filter((x) => !(this.logicOpts.areaSources ?? AREA_SOURCES).includes(x)),
      });
      // A different choice of rules gets a fresh automatic run.
      if (this.autoLogic) this.runAutoLogic();
    };

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
      switchRow('Auto-apply', 'After every change, apply the chosen rules until they get stuck.', this.autoLogic, (on) => {
        this.autoLogic = on;
        if (!on) {
          this.cancelAutoLogic();
          this.resetLogic();
          this.render();
        }
        save();
      });
      body.append(document.createElement('hr'));
      body.lastElementChild!.className = 'sheet-sep';
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
      // Where Checkerboard balance and Number crossings look for areas.
      if (rules.some((r) => r.id === 'balance' || r.id === 'spacing')) {
        body.append(document.createElement('hr'));
        body.lastElementChild!.className = 'sheet-sep';
        const heading = document.createElement('p');
        heading.className = 'field-label';
        heading.textContent = 'Areas Checkerboard balance and Number crossings look at';
        body.append(heading);
        const sources = new Set(this.logicOpts.areaSources ?? AREA_SOURCES);
        for (const src of AREA_SOURCES) {
          const [label, hint] = AREA_SOURCE_TEXT[src];
          switchRow(label, hint, sources.has(src), (on) => {
            on ? sources.add(src) : sources.delete(src);
            const list = AREA_SOURCES.filter((x) => sources.has(x));
            this.logicOpts = { ...this.logicOpts, areaSources: list.length === AREA_SOURCES.length ? undefined : list };
            save();
            render();
          });
        }
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

  /** Overlay solution lines faintly on the board (the uniqueness chip decides when). */
  showGhost(edges: Iterable<number> | null): void {
    this.ghost = edges ? new Set(edges) : null;
    this.render();
  }

  /** Show a border where a wall would help, or null to hide it (the uniqueness chip decides). */
  suggestWall(edge: number | null): void {
    this.suggestedWall = edge;
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

  /** About to change one thing: save the puzzle first, so Undo takes back one placement at a time. */
  private placing() {
    this.history.push(clonePuzzle(this.puzzle));
    this.changed = true;
  }

  private commitGesture() {
    // Each placement already saved its own undo step; just catch up after the gesture.
    if (this.changed) {
      this.afterChange();
      if (this.note) this.setMessage(this.note);
    }
    this.note = '';
    this.changed = false;
  }

  private afterChange() {
    this.resetLogic();
    this.clearMessage();
    this.render();
    if (this.autoLogic) this.runAutoLogic();
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
    this.placing();
    if (this.paintAdd) {
      p.blocked.add(cell);
      p.endpoints = p.endpoints.filter((end) => endTile(p, end) !== cell);
      p.checkpoints = p.checkpoints.filter((c) => c !== cell);
      for (const e of cellEdges(p, cell)) {
        p.walls.delete(e);
      }
      // A neighbour walled in on its other sides is now closed in too.
      for (const e of cellEdges(p, cell)) for (const c of edgeCells(p, e)) if (c !== cell) this.blackenIfWalledIn(c);
    } else {
      p.blocked.delete(cell);
    }
    this.render();
  }

  /** Add an end (tile or frame border), or remove it if already there. Entrance is placed first. */
  private toggleEnd(end: End) {
    const p = this.puzzle;
    if (p.blocked.has(endTile(p, end))) return;
    this.placing();
    const i = p.endpoints.findIndex((e) => endsEqual(e, end));
    if (i < 0 && p.checkpoints.length) {
      p.checkpoints = [];
      this.note = EXCLUSIVE_NOTE.ends;
    }
    if (i >= 0) p.endpoints.splice(i, 1);
    else if (p.endpoints.length < 2) p.endpoints.push(end);
    else p.endpoints[1] = end; // replace the exit
    this.render();
  }

  /** Add the next numbered checkpoint, or remove one (later numbers move down). */
  private toggleCheckpoint(cell: number) {
    const p = this.puzzle;
    if (p.blocked.has(cell)) return;
    this.placing();
    const i = p.checkpoints.indexOf(cell);
    if (i >= 0) p.checkpoints.splice(i, 1);
    else {
      if (p.endpoints.length) {
        p.endpoints = [];
        this.note = EXCLUSIVE_NOTE.checkpoints;
      }
      p.checkpoints.push(cell);
    }
    this.render();
  }

  private setWall(e: number, on: boolean) {
    const p = this.puzzle;
    if (on === p.walls.has(e)) return;
    // Black tiles are already walled on every side.
    if (on && edgeTouchesBlocked(p, e)) return;
    this.placing();
    if (on) {
      p.walls.add(e);
      // A tile now walled in on every side (the frame counts) can never be visited: make it black.
      for (const c of edgeCells(p, e)) this.blackenIfWalledIn(c);
    } else {
      p.walls.delete(e);
    }
    this.render();
  }

  /**
   * Turn a tile into a black tile if it's closed in on every side: by walls, the frame, or black
   * tiles next to it. Then check its neighbours, which this may close in too. Not a tile with an
   * end or a number on it, and only one with at least two sides that aren't the frame (on a
   * board one tile wide, one wall would otherwise "close in" the tiles on both sides).
   */
  private blackenIfWalledIn(cell: number) {
    const p = this.puzzle;
    if (p.blocked.has(cell)) return;
    const sides = cellEdges(p, cell);
    const closed = (e: number) => p.walls.has(e) || edgeCells(p, e).some((c) => c !== cell && p.blocked.has(c));
    if (sides.length < 2 || !sides.every(closed)) return;
    if (p.checkpoints.includes(cell) || p.endpoints.some((end) => endTile(p, end) === cell)) return;
    p.blocked.add(cell);
    for (const x of sides) p.walls.delete(x);
    for (const x of sides) for (const c of edgeCells(p, x)) if (c !== cell) this.blackenIfWalledIn(c);
  }

  private paintWall(e: number, first: boolean, cell = -1) {
    if (first) {
      // Starting on a black tile (where no wall can go) makes this an erasing stroke too.
      const onBlack = cell >= 0 && this.puzzle.blocked.has(cell);
      this.paintAdd = !onBlack && !this.puzzle.walls.has(e);
      if (onBlack) return this.clearBlack(cell);
    }
    this.setWall(e, this.paintAdd);
  }

  /** Turn a black tile back into an open one (one undo step). */
  private clearBlack(cell: number) {
    if (!this.puzzle.blocked.has(cell)) return;
    this.placing();
    this.puzzle.blocked.delete(cell);
    this.render();
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
      suggestWall: this.suggestedWall ?? undefined,
      segments: logic ? this.logic.segments : undefined,
      xMarks: logic ? this.logic.xs : undefined,
      highlight: logic ? this.logicFresh : undefined,
      focusCells: logic && this.logicFocus.size ? this.logicFocus : undefined,
      errorCells: logic && this.logicBad.length ? new Set(this.logicBad) : undefined,
    });
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.logicBackBtn.disabled = !this.logicHistory.length;

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
/** What each source of areas is called in the rules sheet, and what it means. */
const AREA_SOURCE_TEXT: Record<AreaSource, [string, string]> = {
  cuts: ['Cut off by one or two borders', 'Areas joined to the rest of the board by only one or two open borders.'],
  cuts3: ['Cut off by three borders', 'Areas joined to the rest of the board by exactly three open borders (on boards of up to 100 tiles). Slow to find, so only used when nothing else applies.'],
  rects: ['Rectangles', 'Every rectangle of tiles (on boards over 100 tiles, those of up to 24 tiles, plus strips running all the way across).'],
  rooms: ['Rooms', 'Grown one tile at a time from each tile, following walls and X marks, up to 30 tiles.'],
  chains: ['Chains', 'When an area draws a line out of itself, add the tile across it and one of its neighbours, and keep going while that draws another line out.'],
};

/** The logic options saved with the rule choice. */
function loadLogicOptions(storage: Storage): LogicOptions {
  const saved = storage.loadLogicRules();
  const off = new Set(saved?.areaSourcesOff ?? []);
  const sources = AREA_SOURCES.filter((x) => !off.has(x));
  return { areaSources: sources.length < AREA_SOURCES.length ? sources : undefined };
}

function loadRuleChoice(storage: Storage): Set<RuleId> {
  const saved = storage.loadLogicRules();
  if (!saved) return new Set(ALL_RULES);
  const known = new Set<string>(saved.known ?? BASIC_RULES);
  const on = new Set<string>(saved.enabled);
  return new Set(ALL_RULES.filter((r) => on.has(r) || !known.has(r)));
}
