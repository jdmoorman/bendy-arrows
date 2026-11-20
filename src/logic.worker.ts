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
  ctx.postMessage({
    id,
    segments: [...run.state.segments],
    xs: [...run.state.xs],
    rounds: run.rounds,
    solved: run.solved,
    contradiction: run.contradiction,
  } satisfies LogicReply);
};
