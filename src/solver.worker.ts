/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { solve } from './solver';

export type SolverRequest = { code: string; maxSolutions?: number; nodeLimit?: number };
export type SolverMessage =
  | { type: 'progress'; nodes: number }
  | { type: 'done'; result: import('./solver').SolveResult }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<SolverRequest>) => {
  try {
    const p = decodePuzzle(ev.data.code);
    const result = solve(p, {
      maxSolutions: ev.data.maxSolutions,
      nodeLimit: ev.data.nodeLimit,
      onProgress: (nodes) => ctx.postMessage({ type: 'progress', nodes } satisfies SolverMessage),
    });
    ctx.postMessage({ type: 'done', result } satisfies SolverMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SolverMessage);
  }
};
