/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { solutionUnion, solve, type UnionResult } from './solver';

export type SolverRequest = { code: string; maxSolutions?: number; nodeLimit?: number; mustUse?: number[]; union?: boolean };
export type SolverMessage =
  | { type: 'progress'; nodes: number }
  | { type: 'done'; result: import('./solver').SolveResult }
  | { type: 'union'; edges: number[] }
  | { type: 'union-done'; result: UnionResult }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<SolverRequest>) => {
  try {
    const p = decodePuzzle(ev.data.code);
    if (ev.data.union) {
      // Every line used by some solution, reported as it grows.
      const result = solutionUnion(p, {
        nodeLimit: ev.data.nodeLimit,
        onUpdate: (edges) => ctx.postMessage({ type: 'union', edges } satisfies SolverMessage),
      });
      ctx.postMessage({ type: 'union-done', result } satisfies SolverMessage);
      return;
    }
    const result = solve(p, {
      maxSolutions: ev.data.maxSolutions,
      nodeLimit: ev.data.nodeLimit,
      mustUse: ev.data.mustUse,
      logicFirst: true,
      onProgress: (nodes) => ctx.postMessage({ type: 'progress', nodes } satisfies SolverMessage),
    });
    ctx.postMessage({ type: 'done', result } satisfies SolverMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SolverMessage);
  }
};
