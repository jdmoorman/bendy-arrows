/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { hintJourney, strokeJourney } from './logic';
import { isOneShot } from './model';
import { solve } from './solver';

/** Puzzle codes to solve, in order. */
export type PacksRequest = string[];
/**
 * One level's solution (its lines), or none if it has none, and whether it's the only one;
 * later, once every level is solved, its hint steps (null when it isn't unique), as in the Library.
 */
export type PacksMessage =
  | { kind: 'solved'; code: string; segments: number[] | null; unique: boolean }
  | { kind: 'rated'; code: string; rating: PackRating | null };
export interface PackRating {
  hints: number;
  /** The hints ran out before the end. */
  stuck: boolean;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Solve each level in turn, posting each solution as soon as it's found; then rate them. */
ctx.onmessage = (ev: MessageEvent<PacksRequest>) => {
  const unique = new Set<string>();
  for (const code of ev.data) {
    let segments: number[] | null = null;
    let one = false;
    try {
      const r = solve(decodePuzzle(code), { maxSolutions: 2 });
      segments = r.solutions[0] ?? null;
      one = r.status === 'unique';
    } catch {
      segments = null;
    }
    if (one) unique.add(code);
    ctx.postMessage({ kind: 'solved', code, segments, unique: one } satisfies PacksMessage);
  }
  for (const code of ev.data) {
    let rating: PackRating | null = null;
    if (unique.has(code)) {
      const p = decodePuzzle(code);
      // A one-shot's hints are those for its stroke.
      const j = isOneShot(p) ? strokeJourney(p) : hintJourney(p);
      rating = { hints: j.steps.length, stuck: j.outcome === 'stuck' };
    }
    ctx.postMessage({ kind: 'rated', code, rating } satisfies PacksMessage);
  }
};
