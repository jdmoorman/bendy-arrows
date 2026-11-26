/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { runLogic, runStroke, type Contradiction, type LogicOptions, type RuleId } from './logic';
import { isOneShot } from './model';

/** `segments`: lines to start from (the editor's drawn lines). */
export type LogicRequest = { id: number; code: string; rules: RuleId[]; opts?: LogicOptions; segments?: number[] };
export type LogicReply = {
  id: number;
  segments: number[];
  xs: number[];
  rounds: number;
  solved: boolean;
  contradiction?: Contradiction;
  /** A one-shot whose stroke stalls: the lines the rules find over the rest of the board (drawn faintly). */
  faint: number[];
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Run the chosen rules on a puzzle until they get stuck (a one-shot's stroke, from its entrance), off the main thread. */
ctx.onmessage = (ev: MessageEvent<LogicRequest>) => {
  const { id, code, rules, opts, segments } = ev.data;
  const p = decodePuzzle(code);
  const start = segments?.length ? { segments: new Set(segments), xs: new Set<number>() } : undefined;
  const run = isOneShot(p) ? runStroke(p, rules, start, opts) : runLogic(p, rules, start, opts);
  // A one-shot's stroke that's stuck: the rules over the rest of the board, whose lines are shown
  // faintly, and may find the puzzle can't be solved.
  let faint: number[] = [];
  if (isOneShot(p) && !run.solved && !run.contradiction) {
    const whole = runLogic(p, rules, run.state, opts);
    faint = [...whole.state.segments].filter((e) => !run.state.segments.has(e));
    const c = whole.contradiction;
    if (c) run.contradiction = { ...c, reason: `The stroke is stuck, and the rules find a problem elsewhere on the board. ${c.reason}` };
  }
  ctx.postMessage({
    id,
    segments: [...run.state.segments],
    xs: [...run.state.xs],
    rounds: run.rounds,
    solved: run.solved,
    contradiction: run.contradiction,
    faint,
  } satisfies LogicReply);
};
