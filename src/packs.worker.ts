/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { solve } from './solver';

/** Puzzle codes to solve, in order. */
export type PacksRequest = string[];
/** One level's solution (its lines), or none if it has none. */
export type PacksMessage = { code: string; segments: number[] | null };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Solve each level in turn, posting each solution as soon as it's found. */
ctx.onmessage = (ev: MessageEvent<PacksRequest>) => {
  for (const code of ev.data) {
    let segments: number[] | null = null;
    try {
      segments = solve(decodePuzzle(code), { maxSolutions: 1 }).solutions[0] ?? null;
    } catch {
      segments = null;
    }
    ctx.postMessage({ code, segments } satisfies PacksMessage);
  }
};
