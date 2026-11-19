/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { rateDifficulty } from './generator';
import type { Rating } from './library-table';
import { hintJourney, type HintStep } from './logic';
import { solve } from './solver';

/** A rating, plus (when asked) the hints a player alternating easy rules and hints would need. */
export type RatingMessage = { code: string; rating: Rating; journey?: { steps: HintStep[]; outcome: 'solved' | 'stuck' } };
/** A list of codes to rate (the library), or one request that also wants the hint journey (the editor). */
export type RatingRequest = string[] | { codes: string[]; journey: boolean };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Rate each puzzle code in turn, posting each result as soon as it's ready. */
ctx.onmessage = (ev: MessageEvent<RatingRequest>) => {
  const { codes, journey } = Array.isArray(ev.data) ? { codes: ev.data, journey: false } : ev.data;
  for (const code of codes) {
    let rating: Rating;
    let steps: RatingMessage['journey'];
    try {
      const p = decodePuzzle(code);
      const unique = solve(p, { maxSolutions: 2 }).status === 'unique';
      rating = { unique, difficulty: unique ? rateDifficulty(p) : null, hints: null };
      if (unique) {
        const j = hintJourney(p);
        rating.hints = j.steps.length;
        if (j.outcome === 'stuck') rating.hintsStuck = true;
        if (journey) steps = j;
      }
    } catch {
      rating = { unique: false, difficulty: null, hints: null };
    }
    ctx.postMessage({ code, rating, journey: steps } satisfies RatingMessage);
  }
};
