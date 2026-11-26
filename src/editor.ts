import { encodePuzzle } from './codec';
import { History } from './history';
import { ICONS } from './icons';
import { attachBoardInput, type DragKind } from './input';
import {
  cellEdges,
  edgeCells,
  clonePuzzle,
  puzzlesEqual,
  createPuzzle,
  edgeTouchesBlocked,
  MAX_SIZE,
  MIN_SIZE,
  openCells,
  endTile,
  endsEqual,
  isOneShot,
  type End,
  deleteLine,
  insertLine,
  transformPuzzle,
  type Transform,
  type Puzzle,
  edgeBetween,
  isUsableEdge,
  neighbors,
  edgeCount,
} from './model';
import { CELL, padFor, renderBoard } from './render';
import { missingEnds } from './rules';
import { ADVANCED_RULES, ALL_RULES, applyStep, AREA_SOURCES, BASIC_RULES, findHint, findStrokeHint, IMBALANCE_RULE, RULES, runLogic, TRIAL_RULE, runStroke, strokeFrom, type AreaSource, type LogicOptions, type LogicState, type RuleId, type RuleInfo } from './logic';
import type { LogicReply, LogicRequest } from './logic.worker';
import { Storage } from './storage';
import { openSheet } from './ui';
import { tileFixesInBackground, type FixesRun } from './solver-client';
import { suggestInBackground } from './suggest-client';
import { removableInBackground, simplifyInBackground, type Removable } from './generator-client';
import type { GoalFailure, SimplifyGoal } from './generator';
import { openBlankPuzzleSheet, openGeneratorSheet, type NewPuzzleContext } from './new-puzzle-ui';

type Tool = 'tiles' | 'walls' | 'ends' | 'path';


const TOOL_KIND: Record<Tool, DragKind> = { tiles: 'cells', walls: 'edges', ends: 'ends', path: 'path' };
const TOOL_HINT: Record<Tool, string> = {
  tiles: 'Tap or drag over tiles to make them black.',
  walls: 'Tap or drag along borders to add walls.',
  ends: 'Tap a dot on the frame to add the entrance, then the exit.',
  path: 'Drag to draw the lines you want the path to take; drag along them to erase. Fill obstacles then fills in every tile and border without a line.',
};

/** Why Simplify can't start, by goal failure. */
const GOAL_FAILURE: Record<GoalFailure, string> = {
  'not unique': 'Not unique: Simplify works once the puzzle has exactly one solution.',
  'not easy': 'Not easy yet: the easy rules alone don’t solve this puzzle.',
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
  /**
   * True once New puzzle or Generate has replaced the loaded puzzle: it is a
   * different puzzle now, so saving must not offer to update the library entry
   * the loaded one came from.
   */
  replaced = false;

  private puzzle: Puzzle = createPuzzle(6, 6);
  private history = new History<Puzzle>();
  private tool: Tool = 'tiles';
  private ghost: Set<number> | null = null;
  /** For a puzzle short of ends: where an end would give a solution (from the uniqueness check). */
  private endOptions: Map<number, 'unique' | 'multiple'> | null = null;
  /** After a contradiction: tiles whose change alone gives the puzzle a solution, and the search for them. */
  private fixes = new Map<number, 'unique' | 'multiple'>();
  private fixRun: FixesRun | null = null;
  /** A one-shot whose stroke stalls: the lines the rules find over the rest of the board, drawn faintly. */
  private faintLines = new Set<number>();
  /** The wall or black tile Suggest came up with (dashed on the board until the next edit). */
  private suggested: { kind: 'wall' | 'tile'; at: number[]; remove: number[]; base: Puzzle } | null = null;
  /** Suggest: its button, its progress bar, and the search while it runs. */
  private suggestBtn!: HTMLButtonElement;
  private suggestBar!: HTMLElement;
  private suggestRun: { cancel(): void } | null = null;
  /** Suggest was asked where ends could go: it looks again after each end is placed, until both are. */
  private endsSuggested = false;
  /** Suggest with the Ends tool: where the missing ends could go (set up by the uniqueness check). */
  endSuggester: (() => { result: Promise<void>; cancel(): void }) | null = null;
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
  /** Which groups of the chosen rules Auto-apply runs after every change. */
  private autoGroups = loadAutoGroups(new Storage());
  /** The chosen rules Auto-apply runs: those in a group switched on for it. */
  private get autoRules(): RuleId[] {
    return [...this.logicRules].filter((r) => this.autoGroups.has(autoGroupOf(r)));
  }
  private get autoLogic(): boolean {
    return this.autoRules.length > 0;
  }
  /** Logic engine options: whether rooms stop growing at a tie. */
  private logicOpts: LogicOptions = loadLogicOptions(new Storage());
  private autoWorker: Worker | null = null;
  private oneShotBtn!: HTMLButtonElement;
  /** Which Simplify goal's removable obstacles are shown, what they are (once worked out), and the search for them. */
  private simplifyGoal: SimplifyGoal | null = null;
  private removable: Removable | null = null;
  private removableRun: { cancel(): void } | null = null;
  /** A Remove all (for a goal) in progress. */
  private simplifyRun: { goal: SimplifyGoal; cancel(): void } | null = null;
  /** What Remove all just did, kept at the front of the highlight's message that follows it. */
  private simplifyNote = '';
  private goalBtns!: Record<SimplifyGoal, HTMLButtonElement>;
  private removeAllBtns!: Record<SimplifyGoal, HTMLButtonElement>;
  private fillBtn!: HTMLButtonElement;
  private clearPlanBtn!: HTMLButtonElement;
  /** The wanted path's lines: kept when switching tools, and turned, mirrored or reshaped with the board. */
  private plan = new Set<number>();
  /** A Draw drag only draws or only erases, decided where it starts (as when playing). */
  private planMode: 'draw' | 'erase' | 'undecided' = 'draw';
  /** Row-and-column editing: buttons around the board add and delete rows and columns. */
  private gridEdit = false;
  private gridBtn!: HTMLButtonElement;
  private handles!: HTMLElement;
  private autoId = 0;

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'view editor-view';
    this.el.innerHTML = `
      <div class="board-wrap"><svg class="board" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puzzle editor board"></svg><div class="grid-handles"></div></div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="suggest-progress" hidden><span></span></div>
      <div class="toolbar">
        <!-- Turns and flips: shown while editing rows and columns. -->
        <div class="toolbar-row shape-row">
          <button class="btn stacked" data-turn="rotateLeft" title="Rotate left">${ICONS.rotateLeft}<span>Turn left</span></button>
          <button class="btn stacked" data-turn="rotateRight" title="Rotate right">${ICONS.rotateRight}<span>Turn right</span></button>
          <button class="btn stacked" data-turn="flipH" title="Flip left–right">${ICONS.flipH}<span>Flip left–right</span></button>
          <button class="btn stacked" data-turn="flipV" title="Flip up–down">${ICONS.flipV}<span>Flip up–down</span></button>
        </div>
        <div class="toolbar-section" role="group" aria-label="Tools">
          <div class="toolbar-title" aria-hidden="true">Tools</div>
          <div class="toolbar-row tool-row">
            <div class="segmented" role="group" aria-label="Editing tool">
              <button class="seg-btn" data-tool="tiles">Black tiles</button>
              <button class="seg-btn" data-tool="walls">Walls</button>
              <button class="seg-btn" data-tool="ends">Ends</button>
              <button class="seg-btn" data-tool="path" title="Draw the lines you want the path to take; Fill obstacles then fills in every tile and border without a line">Desired solution</button>
            </div>
          </div>
        </div>
        <div class="toolbar-section" role="group" aria-label="Puzzle">
          <div class="toolbar-title" aria-hidden="true">Puzzle</div>
          <div class="toolbar-row puzzle-row">
            <button class="btn stacked" data-act="grid" aria-pressed="false" title="Edit rows and columns: add or delete them around the board, turn or flip it">${ICONS.grid}<span>Transform grid</span></button>
            <button class="btn" data-act="oneshot" aria-pressed="false" title="One-shot: the path is drawn in one stroke from the entrance, and hints and logic follow it">One-shot</button>
            <button class="btn stacked" data-act="suggest" title="Suggest walls: the change (a wall added, taken away or moved) after which a player needs the most hints with the chosen rules (takes a moment; tap again to stop)">${ICONS.bulb}<span>Suggest</span></button>
          </div>
        </div>
        <div class="toolbar-section" role="group" aria-label="Desired Solution">
          <div class="toolbar-title" aria-hidden="true">Desired Solution</div>
          <div class="toolbar-row fill-row">
            <button class="btn" data-act="clear-plan" title="Clear the desired solution">${ICONS.clear}<span>Clear solution</span></button>
            <button class="btn" data-act="fill" title="Fill obstacles: a black tile on every open tile no line reaches, and a wall on every other border no line crosses">Fill obstacles</button>
          </div>
        </div>
        <div class="toolbar-section" role="group" aria-label="Simplify">
          <div class="toolbar-title" aria-hidden="true">Simplify</div>
          <div class="toolbar-row simplify-row">
            <span class="simplify-goal">
              <button class="btn" data-goal="easy" aria-pressed="false" title="Colour the walls and black tiles that could each go on its own, keeping the puzzle unique and solved by the easy rules alone">Easy extras</button>
              <button class="btn stacked" data-remove-all="easy" aria-label="Remove easy extras" title="Remove every wall and black tile the easy rules don’t need">${ICONS.eraser}<span>Remove</span></button>
            </span>
            <span class="simplify-goal">
              <button class="btn" data-goal="minimal" aria-pressed="false" title="Colour the walls and black tiles that could each go on its own, keeping the solution unique">Minimal extras</button>
              <button class="btn stacked" data-remove-all="minimal" aria-label="Remove minimal extras" title="Remove every wall and black tile the unique solution doesn’t need">${ICONS.eraser}<span>Remove</span></button>
            </span>
          </div>
        </div>
        <div class="toolbar-section" role="group" aria-label="Solution Journey">
          <div class="toolbar-title" aria-hidden="true">Solution Journey</div>
          <div class="toolbar-row logic-row">
            <button class="btn stacked" data-logic="rules" title="Logic rules">${ICONS.list}<span>Rules</span></button>
            <button class="btn stacked" data-logic="reset" title="Reset logic">${ICONS.rewind}<span>Reset</span></button>
            <button class="btn stacked" data-logic="back" title="Undo the last logic step">${ICONS.stepBack}<span>Back</span></button>
            <button class="btn stacked" data-logic="step" title="Logic step">${ICONS.step}<span>Step</span></button>
            <button class="btn stacked" data-logic="fast" title="Apply easy rules until stuck">${ICONS.fastForward}<span>Easy rules</span></button>
            <span class="editor-actions"></span>
          </div>
        </div>
        <div class="toolbar-section" role="group" aria-label="Level">
          <div class="toolbar-title" aria-hidden="true">Level</div>
          <div class="toolbar-row actions-row">
            <button class="btn stacked" data-act="undo">${ICONS.undo}<span>Undo</span></button>
            <button class="btn stacked" data-act="redo">${ICONS.redo}<span>Redo</span></button>
            <button class="btn stacked" data-act="new" title="New blank puzzle">${ICONS.plus}<span>New</span></button>
            <button class="btn stacked" data-act="generate" title="Generate a puzzle">${ICONS.dice}<span>Generate</span></button>
            <button class="btn stacked" data-act="save" title="Save to the library">${ICONS.save}<span>Save</span></button>
            <button class="btn primary stacked" data-act="play" title="Play">${ICONS.play}<span>Play</span></button>
          </div>
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
      path: q('[data-tool=path]'),
    };

    for (const t of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[t].addEventListener('click', () => this.setTool(t));
    // The shape row: rows and columns, turns and flips, and Simplify.
    this.gridBtn = q<HTMLButtonElement>('[data-act=grid]');
    this.gridBtn.addEventListener('click', () => {
      this.gridEdit = !this.gridEdit;
      this.render();
    });
    this.handles = q<HTMLElement>('.grid-handles');
    new ResizeObserver(() => this.drawGridHandles()).observe(q<HTMLElement>('.board-wrap'));
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-turn]')) {
      b.addEventListener('click', () => {
        this.marksStillFit = false;
        this.reshape((p) => transformPuzzle(p, b.dataset.turn as Transform));
      });
    }
    // The Simplify row: per goal, a highlight toggle (one at a time) and Remove all.
    const goals: SimplifyGoal[] = ['easy', 'minimal'];
    this.goalBtns = { easy: q('[data-goal=easy]'), minimal: q('[data-goal=minimal]') };
    this.removeAllBtns = { easy: q('[data-remove-all=easy]'), minimal: q('[data-remove-all=minimal]') };
    for (const g of goals) {
      this.goalBtns[g].addEventListener('click', () => {
        this.simplifyGoal = this.simplifyGoal === g ? null : g;
        this.checkRemovable();
      });
      this.removeAllBtns[g].addEventListener('click', () => this.removeAll(g));
    }
    this.fillBtn = q<HTMLButtonElement>('[data-act=fill]');
    this.fillBtn.addEventListener('click', () => this.fill());
    this.clearPlanBtn = q<HTMLButtonElement>('[data-act=clear-plan]');
    this.clearPlanBtn.addEventListener('click', () => {
      this.plan.clear();
      this.render();
    });
    this.suggestBtn = q<HTMLButtonElement>('[data-act=suggest]');
    this.suggestBtn.addEventListener('click', () => this.suggest());
    this.suggestBar = this.el.querySelector<HTMLElement>('.suggest-progress')!;
    this.oneShotBtn = q<HTMLButtonElement>('[data-act=oneshot]');
    this.oneShotBtn.addEventListener('click', () => this.toggleOneShot());
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
        this.replaced = true;
        this.plan.clear();
        this.edit(() => createPuzzle(w, h));
      },
      onGenerated: (p, { options, difficulty }) => {
        this.marksStillFit = false;
        this.replaced = true;
        this.plan.clear();
        this.edit(() => p);
        const word = (d: string) => (d === 'veryhard' ? 'very hard' : d);
        const note =
          !options.difficulties.length || options.difficulties.includes(difficulty) ? '' : ' (none of the chosen difficulties turned up, so this is the closest)';
        const obstacles = p.walls.size + p.blocked.size;
        this.setMessage(
          `Generated ${difficulty === 'easy' ? 'an' : 'a'} ${word(difficulty)} puzzle with ${obstacles} obstacle${obstacles === 1 ? '' : 's'}${note} · seed ${options.seed}`,
          'success',
        );
      },
    });
    q<HTMLButtonElement>('[data-act=new]').addEventListener('click', () => openBlankPuzzleSheet(newPuzzle()));
    q<HTMLButtonElement>('[data-act=generate]').addEventListener('click', () => openGeneratorSheet(newPuzzle()));
    q<HTMLButtonElement>('[data-act=save]').addEventListener('click', () => this.onSave?.());
    q<HTMLButtonElement>('[data-act=play]').addEventListener('click', () => this.onPlay?.());

    // Touching the board means rows and columns are done: editing them ends, and the touch
    // goes on to do what it would have anyway (this runs before the board's own handler).
    this.svg.addEventListener(
      'pointerdown',
      () => {
        if (!this.gridEdit) return;
        this.gridEdit = false;
        this.render();
      },
      { capture: true },
    );
    attachBoardInput(this.svg, () => this.puzzle, {
      kind: () => TOOL_KIND[this.tool],
      onPathStart: (cell, edge) => {
        if (edge >= 0 && this.plan.has(edge)) {
          this.planMode = 'erase';
          this.erasePlan(edge);
          return;
        }
        const n = cellEdges(this.puzzle, cell).filter((e) => this.plan.has(e)).length;
        this.planMode = n === 0 ? 'draw' : n === 1 ? 'undecided' : 'erase';
      },
      onStep: (from, to) => this.planStep(from, to),
      onHoverEdge: (e) => {
        if (this.planMode === 'erase') this.erasePlan(e);
      },
      onTapCell: (cell) => {
        for (const e of cellEdges(this.puzzle, cell)) this.erasePlan(e);
      },
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

  /**
   * The logic helper's lines and X marks, if it has taken any steps on this puzzle (none if
   * they draw the whole path: Play then starts on a clean board).
   */
  get logicMarks(): { segments: number[]; xMarks: number[] } | null {
    if (!this.logicSteps) return null;
    if (this.logic.segments.size >= openCells(this.puzzle).length - 1) return null;
    return { segments: [...this.logic.segments], xMarks: [...this.logic.xs] };
  }

  load(p: Puzzle): void {
    this.cancelSimplify();
    this.plan.clear();
    this.puzzle = clonePuzzle(p);
    this.marksStillFit = true;
    this.replaced = false;
    this.resetLogic();
    this.history.clear();
    this.clearMessage();
    this.render();
    if (this.autoLogic) this.runAutoLogic();
    if (this.simplifyGoal) this.checkRemovable();
    for (const fn of this.changeListeners) fn(this.puzzle);
  }

  /** Make the puzzle a one-shot, or an ordinary puzzle again (one undoable step). */
  private toggleOneShot() {
    this.cancelAutoLogic();
    const on = !this.puzzle.oneShot;
    this.edit((p) => {
      const q = clonePuzzle(p);
      if (on) q.oneShot = true;
      else delete q.oneShot;
      return q;
    });
    if (on && this.puzzle.endpoints.length < 2) this.setMessage('One-shot: place an entrance and an exit for it to take effect.', 'error');
  }

  // --- Logic helper -------------------------------------------------------

  private resetLogic() {
    this.clearFixes();
    this.faintLines = new Set();
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
    this.faintLines = new Set();
    this.clearMessage();
    const p = this.puzzle;
    // One step is exactly what a Play hint would suggest, using the chosen rules (for a
    // one-shot, the next lines of the stroke from the entrance).
    const stroke = isOneShot(p) ? strokeFrom(p, this.logic.segments) : null;
    const hint = stroke
      ? findStrokeHint(p, stroke.lines, stroke.tiles[stroke.tiles.length - 1], this.logicOpts, this.logicRules, this.logic.xs)
      : findHint(p, this.logic, this.logicRules, this.logicOpts);
    this.logicFresh = new Set();
    this.logicFocus = new Set();
    this.logicBad = hint.kind === 'mistake' ? (hint.cells ?? [hint.cell]) : [];
    if (hint.kind === 'mistake') {
      this.showContradiction(hint.text, hint.fixCells);
      return;
    }
    if (hint.kind === 'solved') {
      this.setMessage(`Solved by logic in ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'}!`, 'success');
      return;
    }
    if (hint.kind === 'none') {
      if (stroke && this.strokeStuckProblem(this.logicRules)) return;
      this.logicNote = this.logicSteps
        ? `Stuck after ${this.logicSteps} step${this.logicSteps === 1 ? '' : 's'} — the chosen rules find nothing more.`
        : 'The chosen rules find nothing to fill in.';
      this.render();
      return;
    }
    const d = hint.deduction;
    this.logicHistory.push({ logic: this.logic, steps: this.logicSteps });
    this.logic = applyStep(stroke ? { segments: stroke.lines, xs: this.logic.xs } : this.logic, { segments: d.segments, xs: d.xs, byRule: {}, solved: false });
    this.logicFresh = new Set([...d.segments, ...d.xs]);
    this.logicFocus = new Set(d.cells ?? [d.cell]);
    this.logicSteps++;
    const label = [...RULES, IMBALANCE_RULE, TRIAL_RULE].find((r) => r.id === d.rule)?.label ?? d.rule;
    this.logicNote = `Step ${this.logicSteps} · ${label}`;
    this.render();
  }

  /** Take hint-sized steps with the chosen easy rules until they find nothing more. */
  private fastForwardLogic() {
    this.cancelAutoLogic();
    this.faintLines = new Set();
    const p = this.puzzle;
    const rules = [...this.logicRules].filter((r) => !ADVANCED_RULES.includes(r));
    const before = { logic: this.logic, steps: this.logicSteps };
    // Speed matters here, not the order a hint would pick: run the easy rules to the end.
    const run = isOneShot(p) ? runStroke(p, rules, this.logic, this.logicOpts) : runLogic(p, rules, this.logic, this.logicOpts);
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
    if (c) this.showContradiction(c.reason, c.fixCells);
    else if (!run.solved && isOneShot(p) && this.strokeStuckProblem(rules)) return;
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
    const id = ++this.autoId;
    this.autoWorker = new Worker(new URL('./logic.worker.ts', import.meta.url), { type: 'module' });
    this.autoWorker.onmessage = (ev: MessageEvent<LogicReply>) => {
      const r = ev.data;
      if (r.id !== this.autoId) return;
      this.cancelAutoLogic();
      this.clearMessage();
      this.resetLogic();
      this.logic = { segments: new Set(r.segments), xs: new Set(r.xs) };
      this.faintLines = new Set(r.faint);
      // Count the automatic run as one step, so Back clears it and Step carries on from it.
      if (r.segments.length || r.xs.length) {
        this.logicHistory.push({ logic: { segments: new Set(), xs: new Set() }, steps: 0 });
        this.logicSteps = 1;
      }
      if (r.contradiction) {
        this.logicBad = r.contradiction.cells ?? [r.contradiction.cell];
        this.showContradiction(r.contradiction.reason, r.contradiction.fixCells);
        return;
      }
      if (r.solved) {
        this.setMessage('Auto-apply: the chosen rules solve it.', 'success');
        return;
      }
      this.logicNote = r.segments.length || r.xs.length ? 'Auto-apply: the chosen rules get this far, then get stuck.' : 'Auto-apply: the chosen rules find nothing to fill in.';
      this.render();
    };
    this.autoWorker.postMessage({ id, code: encodePuzzle(p), rules: this.autoRules, opts: this.logicOpts } satisfies LogicRequest);
  }

  private cancelAutoLogic() {
    this.autoWorker?.terminate();
    this.autoWorker = null;
  }

  private stepLogicBack() {
    this.cancelAutoLogic();
    this.faintLines = new Set();
    const prev = this.logicHistory.pop();
    if (!prev) return;
    this.clearMessage();
    this.logic = prev.logic;
    this.logicSteps = prev.steps;
    this.logicFresh = new Set();
    this.logicFocus = new Set();
    this.logicBad = [];
    this.clearFixes();
    this.logicNote = this.logicSteps ? `Back to step ${this.logicSteps}.` : 'Back to the start.';
    this.render();
  }

  /**
   * While a Simplify goal is shown, work out (in the background) which walls and black tiles
   * could each go on their own with the puzzle still meeting it, and colour them; again after
   * every change.
   */
  private checkRemovable() {
    this.removableRun?.cancel();
    this.removableRun = null;
    this.removable = null;
    const goal = this.simplifyGoal;
    if (!goal) {
      this.render();
      return;
    }
    const p = this.puzzle;
    if (!p.walls.size && !p.blocked.size) {
      this.setMessage('No walls or black tiles to check.');
      return;
    }
    this.render();
    const run = removableInBackground(p, goal, this.logicOpts);
    this.removableRun = run;
    run.result.then(
      (r) => {
        if (this.removableRun !== run) return;
        this.removableRun = null;
        const note = this.simplifyNote;
        this.simplifyNote = '';
        if (typeof r === 'string') return this.setMessage(note + GOAL_FAILURE[r]);
        this.removable = r;
        const n = r.walls.size + r.blocked.size;
        const all = p.walls.size + p.blocked.size;
        const found =
          goal === 'easy'
            ? n
              ? `${n} of ${all} obstacles (in green) could each go on its own and the easy rules still solve the puzzle.`
              : 'The easy rules need every obstacle: removing any one leaves them stuck or the solution not unique.'
            : n
              ? `${n} of ${all} obstacles (in amber) could each go on its own and keep the solution unique.`
              : 'Every obstacle is needed: removing any one makes the solution not unique.';
        this.setMessage(note + found);
      },
      () => {},
    );
  }

  /** A desired-solution drag moved a tile: draw the line between (clearing any wall or black tile in the way) or erase it. */
  private planStep(from: number, to: number): boolean {
    const p = this.puzzle;
    const e = edgeBetween(p, from, to);
    if (this.planMode === 'undecided') this.planMode = this.plan.has(e) ? 'erase' : 'draw';
    if (this.planMode === 'erase') {
      this.erasePlan(e);
      return true;
    }
    if (this.plan.has(e)) return true;
    const degree = (c: number) => cellEdges(p, c).filter((x) => this.plan.has(x)).length;
    if (degree(from) >= 2 || degree(to) >= 2 || this.planJoins(from, to)) return false;
    // Drawing over a wall or a black tile takes it away (each its own undo step, as when placing).
    if (!isUsableEdge(p, e)) {
      this.placing();
      p.walls.delete(e);
      for (const c of [from, to]) p.blocked.delete(c);
    }
    this.plan.add(e);
    this.render();
    return true;
  }

  /** Whether the wanted path already runs from one tile to the other (a line between would close a loop). */
  private planJoins(a: number, b: number): boolean {
    const p = this.puzzle;
    let cell = a;
    let prev = -1;
    for (let i = 0; i <= this.plan.size; i++) {
      const next = neighbors(p, cell).find((n) => n !== prev && this.plan.has(edgeBetween(p, cell, n)));
      if (next === undefined) return false;
      if (next === b) return true;
      [prev, cell] = [cell, next];
    }
    return false;
  }

  private erasePlan(e: number) {
    if (this.plan.delete(e)) this.render();
  }

  /** After an edit: the wanted path loses lines through walls or black tiles (or off the board, after an undone resize). */
  private keepPlanFitting() {
    const p = this.puzzle;
    for (const e of [...this.plan]) if (e >= edgeCount(p) || !isUsableEdge(p, e)) this.plan.delete(e);
  }

  /** A change to the board's shape (turn, flip, rows and columns): the drawn path goes along with it. */
  private reshape(fn: (p: Puzzle) => Puzzle) {
    if (this.plan.size) {
      // Carried as the walls of a copy, so it moves exactly as walls do.
      const carrier = { ...clonePuzzle(this.puzzle), walls: new Set(this.plan), blocked: new Set<number>() };
      this.plan = new Set(fn(carrier).walls);
    }
    this.edit(fn);
  }

  /** Stop a Remove all: the puzzle it started from has changed. */
  private cancelSimplify() {
    this.simplifyNote = '';
    this.simplifyRun?.cancel();
    this.simplifyRun = null;
  }

  /**
   * Fill obstacles around the lines (the desired solution's, or the logic helper's on show), as
   * one undoable step: every open tile no line reaches turns black (unless an end is on it), and
   * every other border no line crosses gets a wall.
   */
  private fill() {
    this.cancelSimplify();
    const p = this.puzzle;
    const lines = new Set(this.plan);
    if (this.logicSteps > 0 || this.logicBad.length > 0) for (const e of this.logic.segments) lines.add(e);
    if (!lines.size) return this.setMessage('Draw the desired solution first: Fill obstacles fills in everything around it.', 'error');
    const endTiles = new Set(p.endpoints.map((end) => endTile(p, end)));
    const black = openCells(p).filter((c) => !endTiles.has(c) && !cellEdges(p, c).some((e) => lines.has(e)));
    const q = clonePuzzle(p);
    for (const c of black) {
      q.blocked.add(c);
      for (const e of cellEdges(q, c)) q.walls.delete(e);
    }
    const walls: number[] = [];
    for (let e = 0; e < edgeCount(q); e++) if (isUsableEdge(q, e) && !lines.has(e)) walls.push(e);
    if (!black.length && !walls.length) return this.setMessage('Nothing to fill: every tile and border without a line is already filled.');
    for (const e of walls) q.walls.add(e);
    this.edit(() => q);
    const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
    const added = [black.length ? count(black.length, 'black tile') : '', walls.length ? count(walls.length, 'wall') : ''].filter(Boolean).join(' and ');
    this.setMessage(`Added ${added}.`, 'success');
  }

  /** Take away every obstacle the goal doesn't need, in the background (one undoable step); again to cancel. */
  private removeAll(goal: SimplifyGoal) {
    const running = this.simplifyRun;
    this.cancelSimplify();
    if (running) {
      this.render();
      if (running.goal === goal) return this.setMessage('Simplify cancelled.');
    }
    const p = this.puzzle;
    const before = p.walls.size + p.blocked.size;
    if (!before) return this.setMessage('No walls or black tiles to remove.');
    const run = simplifyInBackground(p, goal, this.logicOpts);
    const handle = { goal, cancel: run.cancel };
    this.simplifyRun = handle;
    this.setMessage(goal === 'easy' ? 'Removing what the easy rules don’t need…' : 'Removing what the unique solution doesn’t need…');
    run.result.then(
      (q) => {
        if (this.simplifyRun !== handle) return;
        this.simplifyRun = null;
        this.render();
        if (typeof q === 'string') return this.setMessage(GOAL_FAILURE[q]);
        const after = q.walls.size + q.blocked.size;
        if (after === before) return this.setMessage('Nothing to remove: every obstacle is needed.');
        const done = `Removed ${before - after} obstacle${before - after === 1 ? '' : 's'} (${before} → ${after}). `;
        this.edit(() => q);
        // A highlight shown is worked out again for the new puzzle: its message keeps this one.
        if (this.removableRun) this.simplifyNote = done;
        this.setMessage(done.trim(), 'success');
      },
      (err) => {
        if (this.simplifyRun !== handle) return;
        this.simplifyRun = null;
        this.render();
        if (!(err instanceof DOMException)) this.setMessage(err instanceof Error ? err.message : String(err));
      },
    );
    this.render();
  }

  /**
   * In row-and-column editing, buttons around the board: a − beside each row (left) and above
   * each column (top) deletes it, and a + at each gap between rows (right) or columns (bottom),
   * edges included, inserts an empty one there. Touching the board ends it.
   */
  private drawGridHandles() {
    this.handles.replaceChildren();
    this.handles.parentElement!.classList.toggle('grid-editing', this.gridEdit);
    // Turns and flips show in place of the message while rows and columns are being edited.
    // (Laid over the message's space, so nothing below or beside moves.)
    this.el.classList.toggle('grid-editing', this.gridEdit);
    if (!this.gridEdit) return;
    const p = this.puzzle;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return;
    const box = this.handles.getBoundingClientRect();
    const pad = Number(this.svg.dataset.pad ?? 0);
    const at = (gx: number, gy: number): [number, number] => {
      const q = new DOMPoint(pad + gx * CELL, pad + gy * CELL).matrixTransform(ctm);
      return [q.x - box.left, q.y - box.top];
    };
    const [x0, y0] = at(0, 0);
    const [x1, y1] = at(p.w, p.h);
    const cell = (x1 - x0) / p.w;
    // − buttons halfway across the margin; + buttons further out, so the two at the
    // bottom-right corner don't overlap.
    const padPx = (pad / CELL) * cell;
    const gap = padPx / 2;
    const out = padPx * 0.78;
    const button = (text: string, label: string, x: number, y: number, enabled: boolean, run: (p: Puzzle) => Puzzle) => {
      const b = document.createElement('button');
      b.className = `grid-handle ${text === '+' ? 'add' : 'remove'}`;
      b.innerHTML = text === '+' ? ICONS.plus : ICONS.minus;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.disabled = !enabled;
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      b.addEventListener('click', () => {
        this.marksStillFit = false;
        this.reshape(run);
      });
      this.handles.append(b);
    };
    for (let r = 0; r < p.h; r++) button('−', `Delete row ${r + 1}`, x0 - gap, y0 + (r + 0.5) * cell, p.h > MIN_SIZE, (q) => deleteLine(q, 'row', r));
    for (let r = 0; r <= p.h; r++) button('+', r === 0 ? 'Add a row at the top' : r === p.h ? 'Add a row at the bottom' : `Add a row between rows ${r} and ${r + 1}`, x1 + out, y0 + r * cell, p.h < MAX_SIZE, (q) => insertLine(q, 'row', r));
    for (let c = 0; c < p.w; c++) button('−', `Delete column ${c + 1}`, x0 + (c + 0.5) * cell, y0 - gap, p.w > MIN_SIZE, (q) => deleteLine(q, 'col', c));
    for (let c = 0; c <= p.w; c++) button('+', c === 0 ? 'Add a column on the left' : c === p.w ? 'Add a column on the right' : `Add a column between columns ${c} and ${c + 1}`, x0 + c * cell, y1 + out, p.w < MAX_SIZE, (q) => insertLine(q, 'col', c));
  }

  /** The groups in the Rules sheet (easy rules, Checkerboard balance's areas) listed one by one. */
  private expandedRuleGroups = new Set<string>();

  private openRulesSheet() {
    const body = document.createElement('div');
    body.className = 'sheet-stack';
    const save = () => {
      this.storage.saveLogicRules({
        enabled: [...this.logicRules],
        known: [...ALL_RULES, IMBALANCE_RULE.id, TRIAL_RULE.id],
        autoGroups: [...this.autoGroups],
        // Saved as the ones switched off, so a newly added kind of area starts on.
        areaSourcesOff: AREA_SOURCES.filter((x) => !(this.logicOpts.areaSources ?? AREA_SOURCES).includes(x)),
        checkerboardLinesOnly: !!this.logicOpts.checkerboardLinesOnly,
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
      text.append(document.createTextNode(label));
      if (hint) text.append(small);
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
      // Under a rule's switch: whether Auto-apply runs it after every change, until stuck.
      const autoRow = (g: AutoGroup) =>
        switchRow(
          `Auto-apply ${AUTO_LABELS[g]}`,
          '',
          this.autoGroups.has(g),
          (on) => {
            on ? this.autoGroups.add(g) : this.autoGroups.delete(g);
            if (!this.autoLogic) {
              this.cancelAutoLogic();
              this.resetLogic();
              this.render();
            }
            save();
          },
          'auto-row',
        );
      // A switch for several choices at once, with a link to choose them one by one.
      type Choice = { label: string; hint: string; on: boolean; set: (on: boolean) => void };
      const group = (key: string, label: string, summary: string, items: Choice[], auto: AutoGroup, main?: Choice) => {
        const onCount = items.filter((x) => x.on).length;
        const open = this.expandedRuleGroups.has(key);
        const hint = document.createElement('span');
        hint.textContent = `${summary} `;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'link-btn';
        toggle.textContent = open ? 'Group them again' : 'Choose them one by one';
        toggle.addEventListener('click', (ev) => {
          ev.preventDefault(); // don't flip the switch this link sits in
          open ? this.expandedRuleGroups.delete(key) : this.expandedRuleGroups.add(key);
          render();
        });
        hint.append(toggle);
        // With a main choice (a rule and its options), the switch is that rule: on with every
        // option when switched on, part on when some options are off.
        const isOn = main ? main.on : onCount === items.length;
        const all = switchRow(label, hint, isOn && onCount === items.length, (on) => {
          main?.set(on);
          if (on || !main) for (const x of items) x.set(on);
          save();
          render();
        });
        all.indeterminate = main ? main.on && onCount < items.length : onCount > 0 && onCount < items.length;
        autoRow(auto);
        if (open) {
          for (const x of items) {
            switchRow(
              x.label,
              x.hint,
              x.on,
              (on) => {
                x.set(on);
                save();
                render();
              },
              'sub-rule',
            );
          }
        }
      };
      const ruleChoice = (r: RuleInfo): Choice => ({
        label: r.label,
        hint: r.hint,
        on: this.logicRules.has(r.id),
        set: (on) => (on ? this.logicRules.add(r.id) : this.logicRules.delete(r.id)),
      });
      const easy = RULES.filter((r) => !ADVANCED_RULES.includes(r.id));
      group('easy', 'Easy rules', `${easy.map((r) => r.label).join(', ')}.`, easy.map(ruleChoice), 'easy');
      for (const r of RULES.filter((r) => ADVANCED_RULES.includes(r.id) && r.id !== 'balance')) {
        const c = ruleChoice(r);
        switchRow(c.label, c.hint, c.on, (on) => {
          c.set(on);
          save();
          render();
        });
      }
      // Checkerboard balance, with the kinds of areas it looks at (Checkerboard imbalance,
      // below, looks at the same ones).
      const sources = new Set(this.logicOpts.areaSources ?? AREA_SOURCES);
      const areas: Choice[] = AREA_SOURCES.map((src) => ({
        label: AREA_SOURCE_TEXT[src][0],
        hint: AREA_SOURCE_TEXT[src][1],
        on: sources.has(src),
        set: (on) => {
          on ? sources.add(src) : sources.delete(src);
          const list = AREA_SOURCES.filter((x) => sources.has(x));
          this.logicOpts = { ...this.logicOpts, areaSources: list.length === AREA_SOURCES.length ? undefined : list };
        },
      }));
      const balance = RULES.find((r) => r.id === 'balance')!;
      group('balance', balance.label, `${balance.hint} Areas: ${AREA_SOURCES.map((x) => AREA_SOURCE_TEXT[x][0].toLowerCase()).join(', ')}.`, areas, 'balance', ruleChoice(balance));
      const im = ruleChoice(IMBALANCE_RULE);
      switchRow(im.label, `${im.hint} Uses the same areas as Checkerboard balance.`, im.on, (on) => {
        im.set(on);
        save();
        render();
      });
      autoRow('imbalance');
      switchRow(
        'Checkerboard rules draw lines only',
        'Checkerboard balance and imbalance never put down X marks (as when looking for one-shots whose hints never hand the player a checkerboard X).',
        !!this.logicOpts.checkerboardLinesOnly,
        (on) => {
          this.logicOpts = { ...this.logicOpts, checkerboardLinesOnly: on || undefined };
          save();
          render();
        },
      );
      const tr = ruleChoice(TRIAL_RULE);
      switchRow(tr.label, `${tr.hint} Slow, and only on boards of up to 150 tiles.`, tr.on, (on) => {
        tr.set(on);
        save();
        render();
      });
      autoRow('trial');
    };
    render();
    openSheet('Logic rules', body);
  }

  /**
   * A contradiction the logic found: say why, then look for one-tile changes in and around the
   * highlighted tiles (an open tile made black, or a black tile beside them made open) that give
   * the puzzle a solution, and ring them.
   */
  private showContradiction(why: string, fixCells?: number[]) {
    this.clearFixes();
    const base = `Contradiction: ${why} This puzzle has no solution.`;
    const p = this.puzzle;
    const area = new Set(this.logicBad);
    const cells = fixCells ?? [...area, ...[...area].flatMap((c) => neighbors(p, c)).filter((c) => p.blocked.has(c))];
    if (!cells.length) {
      // The colour check found no one tile that fixes it: only moving an end can.
      this.setMessage(fixCells ? `${base} No single black-tile change can fix the colours: move an end.` : base, 'error');
      return;
    }
    this.setMessage(`${base} Looking for a one-tile fix…`, 'error');
    const run = tileFixesInBackground(p, cells, (f) => {
      this.fixes.set(f.cell, f.status === 'unique' ? 'unique' : 'multiple');
      this.render();
    });
    this.fixRun = run;
    run.result
      .then((fixes) => {
        if (this.fixRun !== run) return;
        this.fixRun = null;
        const unique = fixes.filter((f) => f.status === 'unique').length;
        const add = fixes.some((f) => f.add);
        const remove = fixes.some((f) => !f.add);
        const how = add && remove ? 'Making a ringed tile black (or a ringed black tile open)' : add ? 'Making a ringed tile black' : 'Making a ringed black tile open';
        this.setMessage(
          fixes.length
            ? `${base} ${how} gives it a solution${unique ? ` — exactly one for the ${unique === fixes.length ? '' : `${unique} `}green one${unique === 1 ? '' : 's'}` : ', though more than one'}.`
            : `${base} No single black-tile change here gives it a solution.`,
          'error',
        );
      })
      .catch(() => {});
  }

  /**
   * A one-shot's stroke is stuck: the stroke's rules only look at its head, so run the rules
   * over the whole board from here too, and show any contradiction they find (the puzzle may
   * have no solution). True if there was one.
   */
  private strokeStuckProblem(rules: Iterable<RuleId>): boolean {
    const run = runLogic(this.puzzle, rules, this.logic, this.logicOpts);
    // The rest of the board's lines, faintly: the stroke itself stays as it is.
    this.faintLines = new Set([...run.state.segments].filter((e) => !this.logic.segments.has(e)));
    const c = run.contradiction;
    if (!c) return false;
    this.logicBad = c.cells?.length ? c.cells : [c.cell];
    this.showContradiction(`The stroke is stuck, and the rules find a problem elsewhere on the board. ${c.reason}`, c.fixCells);
    return true;
  }

  private clearFixes() {
    this.fixRun?.cancel();
    this.fixRun = null;
    this.fixes = new Map();
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

  /** Mark the frame spots where an end gives the puzzle a solution, or null to hide them. */
  showEndOptions(options: Map<number, 'unique' | 'multiple'> | null): void {
    this.endOptions = options;
    this.render();
  }

  /**
   * Suggest (or, while one is being worked out, stop): the wall (Walls tool) or black tile (Tiles
   * tool) after which the chosen logic rules draw the most lines, keeping a solution. Shown
   * dashed; tapping it places it.
   */
  private suggest() {
    if (this.suggestRun) {
      // Stopped by hand: no more looking again after each end, either.
      this.endsSuggested = false;
      return this.cancelSuggest();
    }
    if (this.tool === 'ends') return this.suggestEnds();
    if (this.tool !== 'walls' && this.tool !== 'tiles') return;
    const kind = this.tool === 'walls' ? 'wall' : 'tile';
    this.suggested = null;
    this.suggestBar.hidden = false;
    const fill = this.suggestBar.querySelector('span')!;
    fill.style.width = '0%';
    this.setMessage(`Looking for the ${kind === 'wall' ? 'walls' : 'black tiles'} that make a player need the most hints…`);
    const run = suggestInBackground(this.puzzle, kind, [...this.logicRules], this.logicOpts, (f) => (fill.style.width = `${Math.round(f * 100)}%`));
    this.suggestRun = run;
    this.render();
    run.result
      .then((s) => {
        if (this.suggestRun !== run) return;
        this.suggestRun = null;
        this.suggestBar.hidden = true;
        this.suggested = s ? { kind: s.kind, at: s.at, remove: s.remove ?? [], base: clonePuzzle(this.puzzle) } : null;
        const thing = kind === 'wall' ? 'wall' : 'black tile';
        const what = !s
          ? ''
          : !s.at.length
            ? `taking away the red ${thing}`
            : s.remove?.length
              ? `${thing} (dashed), taking away the red one`
              : s.at.length === 2
                ? `pair of ${thing}s (dashed)`
                : `${thing} (dashed)`;
        this.setMessage(
          s
            ? `Suggested: ${what}. With it a player needs ${s.hints} hint${s.hints === 1 ? '' : 's'}${s.stuck ? ', then gets stuck' : ''}${s.hintsBefore !== undefined ? ` (${s.hintsBefore} now)` : ''}.`
            : `No ${kind === 'wall' ? 'wall added, taken away or moved' : 'black tile, pair or swap'} makes this puzzle need more hints (or get further with them) while keeping a solution.`,
        );
      })
      .catch((err) => {
        if (this.suggestRun !== run) return;
        this.suggestRun = null;
        this.suggestBar.hidden = true;
        this.setMessage(err instanceof Error ? err.message : String(err), 'error');
      });
  }

  /** Suggest with the Ends tool: mark every frame spot where a missing end gives a solution. */
  private suggestEnds() {
    if (!missingEnds(this.puzzle) || !this.endSuggester) return;
    this.endsSuggested = true;
    this.suggestBar.hidden = false;
    this.suggestBar.classList.add('indeterminate');
    const run = this.endSuggester();
    this.suggestRun = run;
    this.render();
    const done = () => {
      if (this.suggestRun !== run) return;
      this.suggestRun = null;
      this.suggestBar.hidden = true;
      this.suggestBar.classList.remove('indeterminate');
      this.render();
    };
    run.result.then(done, done);
  }

  /**
   * After an edit: a suggestion stays while the only changes are suggested walls or tiles being
   * placed (the rest of a suggested pair still shows); any other edit ends it.
   */
  private keepSuggestion() {
    const s = this.suggested;
    if (!s) return;
    const marks = (q: Puzzle) => (s.kind === 'wall' ? q.walls : q.blocked);
    const placed = s.at.filter((x) => marks(this.puzzle).has(x));
    const cleared = s.remove.filter((x) => !marks(this.puzzle).has(x));
    const expected = clonePuzzle(s.base);
    for (const x of placed) marks(expected).add(x);
    for (const x of cleared) marks(expected).delete(x);
    const left = s.at.filter((x) => !placed.includes(x));
    const leftClear = s.remove.filter((x) => !cleared.includes(x));
    this.suggested = puzzlesEqual(this.puzzle, expected) && left.length + leftClear.length ? { ...s, at: left, remove: leftClear, base: clonePuzzle(this.puzzle) } : null;
  }

  private cancelSuggest() {
    if (!this.suggestRun) return;
    this.suggestRun.cancel();
    this.suggestRun = null;
    this.suggestBar.hidden = true;
    this.suggestBar.classList.remove('indeterminate');
    this.clearMessage();
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
    if (t !== this.tool) {
      this.cancelSuggest();
      this.suggested = null;
      this.endsSuggested = false;
    }
    this.tool = t;
    // Picking a tool means rows and columns are done.
    this.gridEdit = false;
    for (const k of Object.keys(this.toolBtns) as Tool[]) this.toolBtns[k].setAttribute('aria-pressed', String(k === t));
    this.render();
  }

  /**
   * Whether the puzzle can be played or saved: it needs both ends. If not,
   * a message says what's missing.
   */
  checkPlayable(): boolean {
    const missing = missingEnds(this.puzzle);
    if (missing) this.setMessage(missing, 'error');
    return !missing;
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
    if (this.changed) this.afterChange();
    this.changed = false;
  }

  private afterChange() {
    this.cancelSimplify();
    this.cancelSuggest();
    this.keepSuggestion();
    this.keepPlanFitting();
    this.resetLogic();
    this.clearMessage();
    this.render();
    if (this.autoLogic) this.runAutoLogic();
    if (this.simplifyGoal) this.checkRemovable();
    for (const fn of this.changeListeners) fn(this.puzzle);
    // Where ends could go was asked for: after placing (or moving) an end, look again for the
    // other, so its spots show (and the dots fit the end now placed), until both are placed.
    if (this.endsSuggested && this.tool === 'ends' && missingEnds(this.puzzle)) this.suggestEnds();
    else this.endsSuggested = false;
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
    if (first) this.paintAdd = !p.blocked.has(cell);
    if (this.paintAdd === p.blocked.has(cell)) return;
    this.placing();
    if (this.paintAdd) {
      p.blocked.add(cell);
      p.endpoints = p.endpoints.filter((end) => endTile(p, end) !== cell);
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

  /** Add an end (a frame border), or remove it if already there. Entrance is placed first. */
  private toggleEnd(end: End) {
    const p = this.puzzle;
    if (p.blocked.has(endTile(p, end))) return;
    this.placing();
    const i = p.endpoints.findIndex((e) => endsEqual(e, end));
    if (i >= 0) p.endpoints.splice(i, 1);
    else if (p.endpoints.length < 2) p.endpoints.push(end);
    else p.endpoints[1] = end; // replace the exit
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
   * end on it, and only one with at least two sides that aren't the frame (on a
   * board one tile wide, one wall would otherwise "close in" the tiles on both sides).
   */
  private blackenIfWalledIn(cell: number) {
    const p = this.puzzle;
    if (p.blocked.has(cell)) return;
    const sides = cellEdges(p, cell);
    const closed = (e: number) => p.walls.has(e) || edgeCells(p, e).some((c) => c !== cell && p.blocked.has(c));
    if (sides.length < 2 || !sides.every(closed)) return;
    if (p.endpoints.some((end) => endTile(p, end) === cell)) return;
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
      // Where ends could go: only while placing ends.
      endOptions: this.tool === 'ends' ? (this.endOptions ?? undefined) : undefined,
      suggestWalls: this.suggested?.kind === 'wall' ? this.suggested.at : undefined,
      suggestClearWalls: this.suggested?.kind === 'wall' && this.suggested.remove.length ? this.suggested.remove : undefined,
      suggestTiles: this.suggested?.kind === 'tile' ? this.suggested.at : undefined,
      suggestClear: this.suggested?.kind === 'tile' && this.suggested.remove.length ? this.suggested.remove : undefined,
      removable: this.simplifyGoal && this.removable ? { ...this.removable, goal: this.simplifyGoal } : undefined,
      segments: logic ? this.logic.segments : undefined,
      plan: this.plan,
      xMarks: logic ? this.logic.xs : undefined,
      highlight: logic ? this.logicFresh : undefined,
      focusCells: logic && this.logicFocus.size ? this.logicFocus : undefined,
      errorCells: logic && this.logicBad.length ? new Set(this.logicBad) : undefined,
      tileFixes: this.fixes.size && this.logicBad.length ? this.fixes : undefined,
      faint: this.faintLines.size ? this.faintLines : undefined,
    });
    this.oneShotBtn.setAttribute('aria-pressed', String(!!p.oneShot));
    const canSuggest = this.tool === 'walls' || this.tool === 'tiles' || (this.tool === 'ends' && !!missingEnds(p));
    this.suggestBtn.disabled = !canSuggest && !this.suggestRun;
    this.suggestBtn.title =
      this.tool === 'ends'
        ? 'Suggest ends: mark every spot on the frame where a missing end gives a solution (tap again to stop)'
        : `Suggest ${this.tool === 'tiles' ? 'black tiles' : 'walls'}: the change (${this.tool === 'tiles' ? 'a tile or pair added, or a tile moved' : 'a wall added, taken away or moved'}) after which a player needs the most hints with the chosen rules (takes a moment; tap again to stop)`;
    this.suggestBtn.classList.toggle('busy', !!this.suggestRun);
    this.gridBtn.setAttribute('aria-pressed', String(this.gridEdit));
    for (const g of ['easy', 'minimal'] as const) {
      this.goalBtns[g].setAttribute('aria-pressed', String(this.simplifyGoal === g));
      this.removeAllBtns[g].classList.toggle('busy', this.simplifyRun?.goal === g);
    }
    this.clearPlanBtn.disabled = !this.plan.size;
    this.drawGridHandles();
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
    this.logicBackBtn.disabled = !this.logicHistory.length;

    this.status.classList.toggle('success', this.messageKind === 'success');
    this.status.classList.toggle('error', this.messageKind === 'error');
    if (this.message) {
      this.status.textContent = this.message;
    } else {
      const open = openCells(p).length;
      this.status.textContent = this.logicNote || `${p.w}×${p.h} · ${open} open tiles. ${TOOL_HINT[this.tool]}`;
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
  return { areaSources: sources.length < AREA_SOURCES.length ? sources : undefined, ...(saved?.checkerboardLinesOnly ? { checkerboardLinesOnly: true } : {}) };
}

type AutoGroup = 'easy' | 'balance' | 'imbalance' | 'trial';
/** The groups Auto-apply can run, each with its own switch (under its rule's). */
const AUTO_LABELS: Record<AutoGroup, string> = { easy: 'easy rules', balance: 'Checkerboard balance', imbalance: 'Checkerboard imbalance', trial: 'One-step trial' };
const autoGroupOf = (r: RuleId): AutoGroup => (r === 'balance' || r === 'imbalance' || r === 'trial' ? r : 'easy');

/** The saved Auto-apply groups; an older save's single switch meant every group. */
function loadAutoGroups(storage: Storage): Set<AutoGroup> {
  const saved = storage.loadLogicRules();
  const all = Object.keys(AUTO_LABELS) as AutoGroup[];
  if (saved?.autoGroups) return new Set(all.filter((g) => saved.autoGroups!.includes(g)));
  return new Set(saved?.auto ? all : []);
}

function loadRuleChoice(storage: Storage): Set<RuleId> {
  const saved = storage.loadLogicRules();
  if (!saved) return new Set(ALL_RULES);
  const known = new Set<string>(saved.known ?? BASIC_RULES);
  const on = new Set<string>(saved.enabled);
  // Checkerboard imbalance and the one-step trial are off unless chosen.
  const chosen = ALL_RULES.filter((r) => on.has(r) || !known.has(r));
  return new Set([...chosen, ...[IMBALANCE_RULE.id, TRIAL_RULE.id].filter((r) => on.has(r))]);
}
