/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { rateDifficulty } from './generator';
import type { Rating } from './library-table';
import { solve } from './solver';

export type RatingMessage = { code: string; rating: Rating };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Rate each puzzle code in turn, posting each result as soon as it's ready. */
ctx.onmessage = (ev: MessageEvent<string[]>) => {
  for (const code of ev.data) {
    let rating: Rating;
    try {
      const p = decodePuzzle(code);
      const unique = solve(p, { maxSolutions: 2 }).status === 'unique';
      rating = { unique, difficulty: unique ? rateDifficulty(p) : null };
    } catch {
      rating = { unique: false, difficulty: null };
    }
    ctx.postMessage({ code, rating } satisfies RatingMessage);
  }
};
