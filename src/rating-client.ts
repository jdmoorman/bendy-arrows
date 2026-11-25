import { decodePuzzle, encodePuzzle } from './codec';
import { difficultyLevel, ratingHints } from './difficulty';
import type { Rating } from './library-table';
import type { RatingMessage, RatingRequest } from './rating.worker';

/** Rate a puzzle in a background worker. */
export function rateInBackground(code: string): Promise<Rating> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./rating.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RatingMessage>) => {
      worker.terminate();
      resolve(ev.data.rating);
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || 'Rating failed.'));
    };
    worker.postMessage([code] satisfies RatingRequest);
  });
}

/** The puzzle's code as a level: carrying its difficulty, worked out in the background. */
export async function levelCode(code: string): Promise<string> {
  const h = ratingHints(await rateInBackground(code));
  if (!h) throw new Error('A level needs exactly one solution.');
  return encodePuzzle(decodePuzzle(code), difficultyLevel(h));
}
