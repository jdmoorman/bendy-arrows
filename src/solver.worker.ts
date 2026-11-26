/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { logicContradiction, type LogicCheck } from './logic';
import { endFixes, endPlacements, solutionUnion, solve, tileFixes, type EndFix, type EndOption, type TileFix, type UnionResult } from './solver';

export type SolverRequest = { code: string; maxSolutions?: number; nodeLimit?: number; mustUse?: number[]; union?: boolean; ends?: boolean; fixes?: number[]; check?: LogicCheck };
export type SolverMessage =
  | { type: 'progress'; nodes: number }
  | { type: 'done'; result: import('./solver').SolveResult }
  | { type: 'union'; edges: number[] }
  | { type: 'union-done'; result: UnionResult }
  | { type: 'end'; option: EndOption }
  | { type: 'ends-done'; options: EndOption[]; unchecked: number }
  | { type: 'fix'; fix: TileFix }
  | { type: 'fixes-done'; fixes: TileFix[]; endFixes: EndFix[] }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<SolverRequest>) => {
  try {
    const p = decodePuzzle(ev.data.code);
    // Fixes and end spots only count if these rules then find no contradiction.
    const check = ev.data.check;
    const ok = check ? (q: import('./model').Puzzle) => !logicContradiction(q, check) : undefined;
    if (ev.data.fixes) {
      // A puzzle with no solution: the one-tile changes among these tiles that give it one, and
      // the ends that could move (or be placed) to give it one.
      const fixes = tileFixes(p, ev.data.fixes, { ok, onFound: (fix) => ctx.postMessage({ type: 'fix', fix } satisfies SolverMessage) });
      ctx.postMessage({ type: 'fixes-done', fixes, endFixes: endFixes(p, { ok }) } satisfies SolverMessage);
      return;
    }
    if (ev.data.ends) {
      // A puzzle short of ends: the placements that give it a solution, each as it's found.
      const r = endPlacements(p, { union: true, ok, onFound: (option) => ctx.postMessage({ type: 'end', option } satisfies SolverMessage) });
      ctx.postMessage({ type: 'ends-done', ...r } satisfies SolverMessage);
      return;
    }
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
      onProgress: (nodes) => ctx.postMessage({ type: 'progress', nodes } satisfies SolverMessage),
    });
    ctx.postMessage({ type: 'done', result } satisfies SolverMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SolverMessage);
  }
};
