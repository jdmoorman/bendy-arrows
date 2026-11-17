import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

/** Built-in puzzles (each has a unique solution). */
export const SAMPLES: { name: string; code: string }[] = [
  { name: 'Sample path 6×6', code: 'BQQGBgASAAkAAEgCAAAAAFQAABI' },
  { name: 'Sample loop 6×6', code: 'BQEGBiFAAEAAAAAEAAAAAA' },
  // Medium: Checkerboard balance is needed to solve these with the logic rules.
  { name: 'Medium loop 6×6', code: 'BQEGBgAAAAAAAAAAABRBCQ' },
  { name: 'Medium path 7×6', code: 'BQQHBgAUABMAgAEAAAAAAAAAAAUAawA' },
  // Hard: unique, but the logic rules get stuck partway.
  { name: 'Hard numbers 7×6', code: 'BQgHBgAFACcAEAAaABwACwAAAAEAAAAAAAAAAABAAA' },
  { name: 'Hard loop 7×7', code: 'BQEHBwAAAAEAACAAEgAAAAgAABQA' },
  { name: 'Hard loop 7×8', code: 'BQEHCAAAAAAAAAAAgZILIAAAAgQAAAEA' },
  { name: 'Hard black-tile loop 7×7', code: 'BQEHBwhAIAEBgAEAAAAAAAAAAAAA' },
  { name: 'Hard path 7×7', code: 'BQQHBwAOAAIAAhAAAAAAgAAAAIAAEAUQAA' },
  { name: 'Hard path 8×8', code: 'BQQICAAEAAoAAAAAAAAAAAAJwgBwIQAAhEAAACBA' },
  { name: 'Hard numbers 7×7', code: 'BQgHBwAIACgACgALABcAGAAPACYAHgAAAAAAAAAIAEAAICAAAAAA' },
  { name: 'Hard numbers 8×8', code: 'BQgICAAIAB0ACQAVACYAOwAlADIABABAAAYADAAAAAAAAAAAAAAAAAAAAAA' },
];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
