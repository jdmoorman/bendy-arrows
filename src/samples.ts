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
  { level: 'easy', name: 'Loop 6×6 · walls & tiles', code: 'BQEGBiFAAEAAAAAEAAAAAA' },
  { level: 'easy', name: 'Loop 6×6 · walls & tiles 2', code: 'BQEGBgAAAASBgJAAAAACAA' },
  { level: 'easy', name: 'Loop 6×5 · walls', code: 'BQEGBQAAAAAABAEgIQA' },
  { level: 'easy', name: 'Loop 6×6 · black tiles', code: 'BQEGBkGQIkQAAAAAAAAAAA' },
  { level: 'easy', name: 'Path 6×6 · walls', code: 'BQQGBgASAAEAAAAAAAAAAElAKAA' },
  { level: 'easy', name: 'Path 6×6 · black tiles', code: 'BQQGBgAIAAkAwEAUAQAAAAAAAAA' },
  { level: 'easy', name: 'Numbers 6×6 · walls', code: 'BQgGBgACAAcAFAAAAAAAIANAKICAAA' },
  { level: 'easy', name: 'Numbers 6×6 · black tiles', code: 'BQgGBgAHAAcAGQAhABQAHQAVAAkgIAEAAAAAAAAAAAA' },
  { level: 'easy', name: 'Numbers 7×6 · black tiles', code: 'BQgHBgAGACIACQASAAwAEAAdEAACAMAAAAAAAAAAAAAA' },
  { level: 'easy', name: 'Numbers 7×7 · walls', code: 'BQgHBwAIACgACgALABcAGAAPACYAHgAAAAAAAAAIAEAAICAAAAAA' },
  { level: 'medium', name: 'Loop 6×6 · walls', code: 'BQEGBgAAAAAAAAAAABRBCQ' },
  { level: 'medium', name: 'Path 7×6 · walls & tiles', code: 'BQQHBgAUABMAgAEAAAAAAAAAAAUAawA' },
  { level: 'medium', name: 'Loop 7×7 · walls & tiles', code: 'BQEHBwAAAAEAACAAEgAAAAgAABQA' },
  { level: 'medium', name: 'Loop 7×8 · walls', code: 'BQEHCAAAAAAAAAAAgZILIAAAAgQAAAEA' },
  { level: 'medium', name: 'Loop 7×7 · black tiles', code: 'BQEHBwhAIAEBgAEAAAAAAAAAAAAA' },
  { level: 'medium', name: 'Path 7×7 · walls & tiles', code: 'BQQHBwAVAAkAAAgAAEAIgEBAAQAAIAAAAA' },
  { level: 'medium', name: 'Path 8×8 · walls', code: 'BQQICAAEAAoAAAAAAAAAAAAJwgBwIQAAhEAAACBA' },
  { level: 'medium', name: 'Loop 6×6 · walls 2', code: 'BQEGBgAAAAAAABIEAAoAIA' },
  { level: 'hard', name: 'Path 6×6 · walls', code: 'BQQGBgAVAAkAAAAAgIAiAAAAwAA' },
  { level: 'medium', name: 'Numbers 6×6 · walls', code: 'BQgGBgACAAgAAgAAAAAAEAIAAAKAIA' },
  { level: 'medium', name: 'Numbers 7×7 · walls', code: 'BQgHBwAGABYAHwAuABcAEQAAAAAAAAAAAAAEAAiACAIAgAI' },
  { level: 'hard', name: 'Loop 8×8 · walls', code: 'BQEICAAAAAAAAAAAgAAAQQASAEQgAkxABCA' },
  { level: 'hard', name: 'Loop 7×8 · walls 2', code: 'BQEHCAAAAAAAAAACCCAaAAMABCEAYAAA' },
  { level: 'medium', name: 'Path 7×7 · walls', code: 'BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA' },
  { level: 'hard', name: 'Path 7×7 · walls 2', code: 'BQQHBwANABIAAAAAAAAIQMAECwAQAQAAAA' },
  { level: 'hard', name: 'Path 8×8 · walls 2', code: 'BQQICAAKAA0AAAAAAAAAAABFKQCBCAAAIAgABEFI' },
  { level: 'hard', name: 'Path 7×7 · walls 3', code: 'BQQHBwAXAAsAAAAAAAAAAQQgAAAwGCoAAw' },
  { level: 'veryhard', name: 'Loop 8×8 · walls', code: 'BQEICAAAAAAAAAAAAAQIgAMQAQQgBAYEICo' },
  { level: 'medium', name: 'Loop 7×7 · walls & tiles', code: 'BQEHBwMAQAAAAAAEgAABAAAhgAAC' },
  { level: 'veryhard', name: 'Loop 8×8 · walls 2', code: 'BQEICAAAAAAAAAAAiIBCJEABBEAARAAYAAA' },
  { level: 'hard', name: 'Loop 8×8 · walls 3', code: 'BQEICAAAAAAAAAAAAAACAQUBABiBGAQQAhA' },
  { level: 'hard', name: 'Loop 7×8 · walls', code: 'BQEHCAAAAAAAAAAAA0kKAEAAAJCAEAAA' },
  { level: 'veryhard', name: 'Loop 8×8 · walls 4', code: 'BQEICAAAAAAAAAAAAIghAAIsAAhAMBBUQAA' },
  { level: 'veryhard', name: 'Loop 7×7 · walls & tiles 2', code: 'BQEHBwAAAAAAQASAAwEBQAAEAAgA' },
  { level: 'veryhard', name: 'Path 8×8 · walls & tiles', code: 'BQQICAAVABIAAIAAEAAAAAAAIAAwwAACCAQEAAgA' },
  { level: 'hard', name: 'Path 7×7 · walls & tiles 2', code: 'BQQHBwAbAApAAIAEAAAAAQAAAQAAAABQAA' },
  { level: 'veryhard', name: 'Path 7×7 · walls', code: 'BQQHBwAXAAkAAAAAAAAAQmZAAQAgACAABQ' },
  { level: 'veryhard', name: 'Path 7×7 · walls 2', code: 'BQQHBwAXAA4AAAAAAAAIICIIAAAAQIoACA' },
  { level: 'hard', name: 'Path 8×8 · walls', code: 'BQQICAAbAAsAAAAAAAAAAACQIEABGAEABAJAAAAA' },
  { level: 'veryhard', name: 'Numbers 7×6 · walls & tiles', code: 'BQgHBgAFACcAEAAaABwACwAAAAEAAAAAAAAAAABAAA' },
  { level: 'veryhard', name: 'Numbers 8×8 · black tiles', code: 'BQgICAAIAB0ACQAVACYAOwAlADIABABAAAYADAAAAAAAAAAAAAAAAAAAAAA' },
  // Sparse: medium and hard puzzles that are unique with one obstacle, from an
  // exhaustive search. Mirror images and rotations are listed once. Samples smaller
  // than 30 tiles, or only 3 tiles wide or tall, are left out.
  { level: 'medium', group: 'one', name: 'Path 6×5 · 1 wall', code: 'BQQGBQABAAcAAAAAAEAAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×4 · 1 wall', code: 'BQQIBAAVAAkAAAAAAAAAAQAAAA' },
  { level: 'hard', group: 'one', name: 'Path 8×5 · 1 wall', code: 'BQQIBQAWAAkAAAAAAAAAAAEAAAAAAA' },
  // Fewest obstacles the generator found for each size (sparsity research).
  { level: 'easy', group: 'fewest', name: 'Loop 5×6 · 3 obstacles', code: 'BQEFBgAAAIAAAAAAQQA' },
  { level: 'easy', group: 'fewest', name: 'Loop 6×6 · 3 obstacles #1', code: 'BQEGBgAgAAACEAAAAAAAAA' },
  { level: 'easy', group: 'fewest', name: 'Loop 6×6 · 3 obstacles #2', code: 'BQEGBgAACgAAAAAAAAIAAA' },
  { level: 'easy', group: 'fewest', name: 'Loop 7×8 · 4 obstacles', code: 'BQEHCAgAAAAQAAAAEAAAAEAAAAAAAAAA' },
  { level: 'easy', group: 'fewest', name: 'Loop 8×8 · 4 obstacles', code: 'BQEICIAAAgAAAACIAAAAAAAAAAAAAAAAAAA' },
  { level: 'easy', group: 'fewest', name: 'Loop 8×8 · 6 obstacles', code: 'BQEICAggAAACAAAIAAAABAABAAAAAAAAAAA' },
  { level: 'medium', group: 'fewest', name: 'Loop 9×10 · 14 obstacles', code: 'BQEJCgAABAEACAAAAgAAABAgAAAAAAAJAAAACAABAgCCgAAA' },
  { level: 'easy', group: 'fewest', name: 'Loop 9×10 · 16 obstacles', code: 'BQEJChAAAAAAAQAAAgAgAAAASRAEACAAAAAAABAEQCAgAAAB' },
  { level: 'easy', group: 'fewest', name: 'Loop 10×10 · 19 obstacles', code: 'BQEKCgAAIAEAQAAEAAAAAAAACABAAkAAQgAAAEAAISAAAAKQAAAJ' },
  { level: 'medium', group: 'fewest', name: 'Loop 10×10 · 20 obstacles', code: 'BQEKCiAAVgAAAgAAACAAAAEAAAAIAIQAYAAAAAAgAAAQAZAAAAEB' },
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
  { level: 'hard', group: 'hardsparse', name: 'Loop 8×8 · 7 obstacles', code: 'BQEICBAAAAgAASAAAAAAAEAAAAABAAAAAgA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 8×8 · 8 obstacles', code: 'BQEICAAAAAAAgQAAEAAgAAAIEAACAAAEAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 8×8 · 9 obstacles', code: 'BQEICAAAAIAABAAAAABAAAAAQCIICAABAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 9×10 · 16 obstacles', code: 'BQEJCgABAACAAAgAQAAAAABAGAAJBAgIIEAAAgCAAAAAAAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 9×10 · 17 obstacles', code: 'BQEJCgAAAAAAAAAQAgAAAAiAIQCEEAQAEAAAAUAACAAgIAEA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 9×10 · 18 obstacles', code: 'BQEJCgAAAEAAAAAAgAgQCEAiAABAAIAAAAAAAUSIAQIgAAAA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 10×10 · 21 obstacles', code: 'BQEKCgAAAECAAAgAAAAIACAAAAACEGAQBAEBAEAQMAAAAAAIQhAA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 10×10 · 22 obstacles #1', code: 'BQEKCgAAAAAAAABAAAEAAAAASDACAgCgAQQAAgUAAgAUQQEAAAgA' },
  { level: 'hard', group: 'hardsparse', name: 'Loop 10×10 · 22 obstacles #2', code: 'BQEKCgAAAAAASAAAAAAAAAAACAAAgCCA4CAACBCFABAACIEABAgC' },
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

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
