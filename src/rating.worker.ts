/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { rateDifficulty } from './generator';
import { RATING_VERSION, type Rating } from './library-table';
import { hintJourney, searchMetrics, strokeJourney } from './logic';
import { isOneShot } from './model';
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
      rating = { v: RATING_VERSION, unique, difficulty: unique ? rateDifficulty(p) : null, hints: null, tightest: null, effort: null };
      if (unique) {
        // A one-shot's hints are those for its stroke.
        const j = isOneShot(p) ? strokeJourney(p) : hintJourney(p);
        rating.hints = j.steps.length;
        if (j.outcome === 'stuck') rating.hintsStuck = true;
        const m = searchMetrics(p);
        rating.tightest = Math.round(m.tightest);
        rating.effort = Math.round(m.effort);
      }
    } catch {
      rating = { v: RATING_VERSION, unique: false, difficulty: null, hints: null, tightest: null, effort: null };
    }
    ctx.postMessage({ code, rating } satisfies RatingMessage);
  }
};
