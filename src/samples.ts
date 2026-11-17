import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

/** Built-in puzzles (each has a unique solution). */
export const SAMPLES: { name: string; code: string }[] = [
  { name: 'Sample path 6×6', code: 'BQQGBgASAAkAAEgCAAAAAFQAABI' },
  { name: 'Sample loop 6×6', code: 'BQEGBiFAAEAAAAAEAAAAAA' },
  // These need more than the Logic helper's simple rules: they get stuck partway.
  { name: 'Tricky loop 6×6', code: 'BQEGBgAAAAAAAAAAABRBCQ' },
  { name: 'Tricky path 7×6', code: 'BQQHBgAUABMAgAEAAAAAAAAAAAUAawA' },
  { name: 'Tricky numbers 7×6', code: 'BQgHBgAFACcAEAAaABwACwAAAAEAAAAAAAAAAABAAA' },
];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
