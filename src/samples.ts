import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

export type SampleLevel = 'easy' | 'medium' | 'hard' | 'veryhard';

/**
 * Built-in puzzles, each with a unique solution. The level is the logic
 * rating (see rateDifficulty): easy without Checkerboard balance, medium
 * with small balance areas, hard with bigger ones, very hard beyond every rule.
 */
/** Special collections shown in their own library section. */
export type SampleGroup = 'one' | 'fewest' | 'hardsparse';

export const SAMPLES: { level: SampleLevel; group?: SampleGroup; name: string; code: string }[] = [
  { level: 'easy', name: 'Path 6×6 · walls & tiles', code: 'BQQGBgASAAkAAEgCAAAAAFQAABI' },
  { level: 'easy', name: 'Path 6×6 · walls', code: 'BQQGBgASAAEAAAAAAAAAAElAKAA' },
  { level: 'easy', name: 'Path 6×6 · black tiles', code: 'BQQGBgAIAAkAwEAUAQAAAAAAAAA' },
  { level: 'medium', name: 'Path 7×6 · walls & tiles', code: 'BQQHBgAUABMAgAEAAAAAAAAAAAUAawA' },
  { level: 'medium', name: 'Path 7×7 · walls & tiles', code: 'BQQHBwAVAAkAAAgAAEAIgEBAAQAAIAAAAA' },
  { level: 'medium', name: 'Path 8×8 · walls', code: 'BQQICAAEAAoAAAAAAAAAAAAJwgBwIQAAhEAAACBA' },
  { level: 'hard', name: 'Path 6×6 · walls', code: 'BQQGBgAVAAkAAAAAgIAiAAAAwAA' },
  { level: 'medium', name: 'Path 7×7 · walls', code: 'BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA' },
  { level: 'hard', name: 'Path 7×7 · walls 2', code: 'BQQHBwANABIAAAAAAAAIQMAECwAQAQAAAA' },
  { level: 'hard', name: 'Path 8×8 · walls 2', code: 'BQQICAAKAA0AAAAAAAAAAABFKQCBCAAAIAgABEFI' },
  { level: 'hard', name: 'Path 7×7 · walls 3', code: 'BQQHBwAXAAsAAAAAAAAAAQQgAAAwGCoAAw' },
  { level: 'veryhard', name: 'Path 8×8 · walls & tiles', code: 'BQQICAAVABIAAIAAEAAAAAAAIAAwwAACCAQEAAgA' },
  { level: 'hard', name: 'Path 7×7 · walls & tiles 2', code: 'BQQHBwAbAApAAIAEAAAAAQAAAQAAAABQAA' },
  { level: 'veryhard', name: 'Path 7×7 · walls', code: 'BQQHBwAXAAkAAAAAAAAAQmZAAQAgACAABQ' },
  { level: 'veryhard', name: 'Path 7×7 · walls 2', code: 'BQQHBwAXAA4AAAAAAAAIICIIAAAAQIoACA' },
  { level: 'hard', name: 'Path 8×8 · walls', code: 'BQQICAAbAAsAAAAAAAAAAACQIEABGAEABAJAAAAA' },
  // Sparse: medium and hard puzzles that are unique with one obstacle, from an
  // exhaustive search. Mirror images and rotations are listed once. Samples smaller
  // than 30 tiles, or only 3 tiles wide or tall, are left out.
  { level: 'medium', group: 'one', name: 'Path 6×5 · 1 wall', code: 'BQQGBQABAAcAAAAAAEAAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×4 · 1 wall', code: 'BQQIBAAVAAkAAAAAAAAAAQAAAA' },
  { level: 'hard', group: 'one', name: 'Path 8×5 · 1 wall', code: 'BQQIBQAWAAkAAAAAAAAAAAEAAAAAAA' },
  // Fewest obstacles the generator found for each size (sparsity research).
  { level: 'easy', group: 'fewest', name: 'Path 6×6 · 2 obstacles', code: 'BQQGBgAJAA8AAQAAAAAAAAAAIAA' },
  { level: 'medium', group: 'fewest', name: 'Path 7×7 · 3 obstacles #1', code: 'BQQHBwAVAAgAAABAAAAAACAAAAEAAAAAAA' },
  { level: 'easy', group: 'fewest', name: 'Path 7×7 · 3 obstacles #2', code: 'BQQHBwAFABsAAAAAABAAAIAAAAAAAgAAAA' },
  { level: 'medium', group: 'fewest', name: 'Path 8×8 · 6 obstacles', code: 'BQQICAAZAA8AAACQAAAAAAAEAAAAAAAIAAAAAIgA' },
  { level: 'easy', group: 'fewest', name: 'Path 8×8 · 8 obstacles', code: 'BQQICAAJABMIAAAAAAAAAAAAAARAAAAgCAAICBAA' },
  { level: 'easy', group: 'fewest', name: 'Path 9×9 · 10 obstacles', code: 'BQQJCQAfAA0AAEAAAAgAAAIAAQAAgCAQAAAgABAAAAACAAAAAA' },
  { level: 'easy', group: 'fewest', name: 'Path 9×9 · 14 obstacles', code: 'BQQJCQAfAAkAAAAgAhACAQAQEEAUAAAAYAAAAAIAAAAAACAAAA' },
  { level: 'medium', group: 'fewest', name: 'Path 10×10 · 17 obstacles', code: 'BQQKCgAFACMEAEAAAAAABAAIAAABACQAAIQgBAAQAAAAUAAAAAACIAAAAg' },
  { level: 'easy', group: 'fewest', name: 'Path 10×10 · 26 obstacles', code: 'BQQKCgADACAAAAAAAAAAAAAAAAAAQADAFUAAGAJiAABAEACELQAhAAIEIA' },
  // Hard puzzles with the fewest obstacles a 40-minute generator search found (research/hard-sparse).
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 7 obstacles', code: 'BQQICAAHAAIAAAAAhAAAAAAAAAIAAAAIBAIAAAIA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 8 obstacles', code: 'BQQICAAcABQAIAAAAAAAAQIFAAAAEAAAAAABCAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 9 obstacles', code: 'BQQICAAaAAoAAAAAAAAAAAIAAABCAAAgEAAgAIkA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 9×9 · 13 obstacles', code: 'BQQJCQAfAA8AAEgEAIAADAAAAAAAAAAAAAAFQAAAIABKAAAAAA' },
  { level: 'medium', group: 'hardsparse', name: 'Path 9×9 · 14 obstacles #1', code: 'BQQJCQACAAQAIAAAgQSAAQAAQAAECAAAAMAAAAAAAEAQAAAQAA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 9×9 · 14 obstacles #2', code: 'BQQJCQACAAsAAAAAAAAAAAAAABAAAIIgiAQAEAAgJAAAEEQAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 19 obstacles', code: 'BQQKCgAEAAaAAAAAAACAAAAAIAAAgIUAAAAAAACAFAAAAIASkIIAIEAAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 21 obstacles #1', code: 'BQQKCgAEAAIAAAAAAIAAAAAAAAAAAoAFsAQAABEAAQAAgABAAAAIAUElAA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 21 obstacles #2', code: 'BQQKCgAEAAwAAAAAAAAAAAAAAAAAAIEAAAQiAQCBhBAgEgAChIIAAIIAAA' },
];

/**
 * The samples are archived: the library shows them only when the app runs locally (the dev
 * server, or tests and research scripts). A production build leaves them out entirely.
 */
export const LOCAL_SAMPLES = import.meta.env.DEV ? SAMPLES : [];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
