/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { rateDifficulty } from './generator';
import type { Rating } from './library-table';
import { hintJourney } from './logic';
import { solve } from './solver';

export type RatingMessage = { code: string; rating: Rating };
/** The puzzle codes to rate. */
export type RatingRequest = string[];

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Rate each puzzle code in turn, posting each result as soon as it's ready. */
ctx.onmessage = (ev: MessageEvent<RatingRequest>) => {
  for (const code of ev.data) {
    let rating: Rating;
    try {
      const p = decodePuzzle(code);
      const unique = solve(p, { maxSolutions: 2 }).status === 'unique';
      rating = { unique, difficulty: unique ? rateDifficulty(p) : null, hints: null };
      if (unique) {
        const j = hintJourney(p);
        rating.hints = j.steps.length;
        if (j.outcome === 'stuck') rating.hintsStuck = true;
      }
    } catch {
      rating = { unique: false, difficulty: null, hints: null };
    }
    ctx.postMessage({ code, rating } satisfies RatingMessage);
  }
};
