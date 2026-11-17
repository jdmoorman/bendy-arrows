import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

/** Built-in starter puzzles (each has a unique solution). */
export const SAMPLES: { name: string; code: string }[] = [
  { name: 'Sample path 6×6', code: 'AwQGBgASAAkAAEgCAAAAAFQAABIAAAAAAAAAAA' },
  { name: 'Sample loop 6×6', code: 'AwEGBiFAAEAAAAAEAAAAAAAAAAAAAAAA' },
];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
