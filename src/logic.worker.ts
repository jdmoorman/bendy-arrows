/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { runLogic, runStroke, type Contradiction, type LogicOptions, type RuleId } from './logic';
import { isOneShot } from './model';

export type LogicRequest = { id: number; code: string; rules: RuleId[]; opts?: LogicOptions };
export type LogicReply = {
  id: number;
  segments: number[];
  xs: number[];
  rounds: number;
  solved: boolean;
  contradiction?: Contradiction;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Run the chosen rules on a puzzle until they get stuck (a one-shot's stroke, from its entrance), off the main thread. */
ctx.onmessage = (ev: MessageEvent<LogicRequest>) => {
  const { id, code, rules, opts } = ev.data;
  const p = decodePuzzle(code);
  const run = isOneShot(p) ? runStroke(p, rules, undefined, opts) : runLogic(p, rules, undefined, opts);
  // A one-shot's stroke that's stuck: the rules over the whole board may find the puzzle can't be solved.
  if (isOneShot(p) && !run.solved && !run.contradiction) {
    const c = runLogic(p, rules, run.state, opts).contradiction;
    if (c) run.contradiction = { ...c, reason: `The stroke is stuck, and the rules find a problem elsewhere on the board. ${c.reason}` };
  }
  ctx.postMessage({
    id,
    segments: [...run.state.segments],
    xs: [...run.state.xs],
    rounds: run.rounds,
    solved: run.solved,
    contradiction: run.contradiction,
  } satisfies LogicReply);
};
