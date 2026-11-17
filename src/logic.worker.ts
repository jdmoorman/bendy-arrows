/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { runLogic, type Contradiction, type RuleId } from './logic';

export type LogicRequest = { id: number; code: string; rules: RuleId[] };
export type LogicReply = {
  id: number;
  segments: number[];
  xs: number[];
  rounds: number;
  solved: boolean;
  contradiction?: Contradiction;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Run the chosen rules on a puzzle until they get stuck, off the main thread. */
ctx.onmessage = (ev: MessageEvent<LogicRequest>) => {
  const { id, code, rules } = ev.data;
  const run = runLogic(decodePuzzle(code), rules);
  ctx.postMessage({
    id,
    segments: [...run.state.segments],
    xs: [...run.state.xs],
    rounds: run.rounds,
    solved: run.solved,
    contradiction: run.contradiction,
  } satisfies LogicReply);
};
