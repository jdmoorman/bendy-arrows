/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { solve } from './solver';

/** Puzzle codes to solve, in order. */
export type PacksRequest = string[];
/** One level's solution (its lines), or none if it has none, and whether it's the only one. */
export type PacksMessage = { code: string; segments: number[] | null; unique: boolean };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Solve each level in turn, posting each solution as soon as it's found. */
ctx.onmessage = (ev: MessageEvent<PacksRequest>) => {
  for (const code of ev.data) {
    let segments: number[] | null = null;
    let unique = false;
    try {
      const r = solve(decodePuzzle(code), { maxSolutions: 2 });
      segments = r.solutions[0] ?? null;
      unique = r.status === 'unique';
    } catch {
      segments = null;
    }
    ctx.postMessage({ code, segments, unique } satisfies PacksMessage);
  }
};
