/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import { RATING_VERSION, type Rating } from './library-table';
import { hintJourney, searchMetrics, strokeJourney, type JourneyFrame } from './logic';
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
      const solved = solve(p, { maxSolutions: 2 });
      const unique = solved.status === 'unique';
      rating = { v: RATING_VERSION, unique, hints: null, tightest: null, effort: null, segments: unique ? solved.solutions[0] : null };
      if (unique) {
        // A one-shot's hints are those for its stroke.
        const j = isOneShot(p) ? strokeJourney(p) : hintJourney(p);
        rating.hints = j.steps.length;
        rating.maxArea = Math.max(0, ...j.steps.map((s) => s.area ?? 0));
        if (j.outcome === 'stuck') rating.hintsStuck = true;
        const m = searchMetrics(p);
        rating.tightest = Math.round(m.tightest);
        rating.effort = Math.round(m.effort);
      } else {
        // Not unique: how far the hints get before they're stuck.
        let segments: number[] = [];
        const watch = (f: JourneyFrame) => (segments = f.segments);
        const j = isOneShot(p) ? strokeJourney(p, {}, watch) : hintJourney(p, {}, watch);
        // A one-shot's stroke that stalls: what the hints find over the rest of the board (drawn
        // faintly, as the editor does).
        let faint: number[] = [];
        if (isOneShot(p)) {
          const stroke = new Set(segments);
          hintJourney({ ...p, oneShot: undefined }, {}, (f) => (faint = f.segments.filter((e) => !stroke.has(e))));
        }
        rating.reach = { segments, hints: j.steps.length, faint };
      }
    } catch {
      rating = { v: RATING_VERSION, unique: false, hints: null, tightest: null, effort: null, segments: null, reach: { segments: [], hints: 0, faint: [] } };
    }
    ctx.postMessage({ code, rating } satisfies RatingMessage);
  }
};
