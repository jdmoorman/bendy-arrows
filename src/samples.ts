import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

export type SampleLevel = 'easy' | 'medium' | 'hard' | 'veryhard';

/**
 * Built-in puzzles, each with a unique solution. The level is the logic
 * rating (see rateDifficulty): easy without Checkerboard balance, medium
 * with small balance areas, hard with bigger ones, very hard beyond every rule.
 */
export const SAMPLES: { level: SampleLevel; name: string; code: string }[] = [
  { level: 'easy', name: 'Path 6×6 · walls & tiles', code: 'BQQGBgASAAkAAEgCAAAAAFQAABI' },
  { level: 'easy', name: 'Loop 6×6 · walls & tiles', code: 'BQEGBiFAAEAAAAAEAAAAAA' },
  { level: 'easy', name: 'Loop 6×6 · walls & tiles 2', code: 'BQEGBgAAAASBgJAAAAACAA' },
  { level: 'easy', name: 'Loop 6×5 · walls', code: 'BQEGBQAAAAAABAEgIQA' },
  { level: 'easy', name: 'Loop 6×6 · black tiles', code: 'BQEGBkGQIkQAAAAAAAAAAA' },
  { level: 'easy', name: 'Path 5×5 · walls & tiles', code: 'BQQFBQASAAIAAEAABQABAAA' },
  { level: 'easy', name: 'Path 6×6 · walls', code: 'BQQGBgASAAEAAAAAAAAAAElAKAA' },
  { level: 'easy', name: 'Path 6×6 · black tiles', code: 'BQQGBgAIAAkAwEAUAQAAAAAAAAA' },
  { level: 'easy', name: 'Numbers 5×5 · walls & tiles', code: 'BQgFBQACABAACwAAQAAQAAAAAA' },
  { level: 'easy', name: 'Numbers 6×6 · walls', code: 'BQgGBgACAAcAFAAAAAAAIANAKICAAA' },
  { level: 'easy', name: 'Numbers 6×6 · black tiles', code: 'BQgGBgAHAAcAGQAhABQAHQAVAAkgIAEAAAAAAAAAAAA' },
  { level: 'medium', name: 'Loop 6×6 · walls', code: 'BQEGBgAAAAAAAAAAABRBCQ' },
  { level: 'medium', name: 'Path 7×6 · walls & tiles', code: 'BQQHBgAUABMAgAEAAAAAAAAAAAUAawA' },
  { level: 'medium', name: 'Loop 7×7 · walls & tiles', code: 'BQEHBwAAAAEAACAAEgAAAAgAABQA' },
  { level: 'medium', name: 'Loop 7×8 · walls', code: 'BQEHCAAAAAAAAAAAgZILIAAAAgQAAAEA' },
  { level: 'medium', name: 'Loop 7×7 · black tiles', code: 'BQEHBwhAIAEBgAEAAAAAAAAAAAAA' },
  { level: 'medium', name: 'Path 7×7 · walls & tiles', code: 'BQQHBwAOAAIAAhAAAAAAgAAAAIAAEAUQAA' },
  { level: 'medium', name: 'Path 8×8 · walls', code: 'BQQICAAEAAoAAAAAAAAAAAAJwgBwIQAAhEAAACBA' },
  { level: 'medium', name: 'Loop 6×6 · walls 2', code: 'BQEGBgAAAAAAABIEAAoAIA' },
  { level: 'hard', name: 'Path 6×6 · walls', code: 'BQQGBgACAA4AAAAAAIAQAAAIgQI' },
  { level: 'medium', name: 'Numbers 6×6 · walls', code: 'BQgGBgACAAgAAgAAAAAAEAIAAAKAIA' },
  { level: 'medium', name: 'Numbers 7×7 · walls', code: 'BQgHBwAGABYAHwAuABcAEQAAAAAAAAAAAAAEAAiACAIAgAI' },
  { level: 'medium', name: 'Numbers 7×6 · black tiles', code: 'BQgHBgAGACIACQASAAwAEAAdEAACAMAAAAAAAAAAAAAA' },
  { level: 'hard', name: 'Loop 8×8 · walls', code: 'BQEICAAAAAAAAAAAgAAAQQASAEQgAkxABCA' },
  { level: 'hard', name: 'Loop 7×8 · walls 2', code: 'BQEHCAAAAAAAAAACCCAaAAMABCEAYAAA' },
  { level: 'medium', name: 'Path 7×7 · walls', code: 'BQQHBwACAAsAAAAAAAAAhBQAEAAALAAABA' },
  { level: 'hard', name: 'Path 7×7 · walls 2', code: 'BQQHBwANABIAAAAAAAAIQMAECwAQAQAAAA' },
  { level: 'hard', name: 'Path 8×8 · walls 2', code: 'BQQICAAKAA0AAAAAAAAAAABFKQCBCAAAIAgABEFI' },
  { level: 'hard', name: 'Path 7×7 · walls 3', code: 'BQQHBwAJABkAAAAAAAAAKAAEAABgMCoABg' },
  { level: 'veryhard', name: 'Loop 8×8 · walls', code: 'BQEICAAAAAAAAAAAAAQIgAMQAQQgBAYEICo' },
  { level: 'veryhard', name: 'Loop 7×7 · walls & tiles', code: 'BQEHBwMAQAAAAAAEgAABAAAhgAAC' },
  { level: 'veryhard', name: 'Loop 8×8 · walls 2', code: 'BQEICAAAAAAAAAAAiIBCJEABBEAARAAYAAA' },
  { level: 'veryhard', name: 'Loop 8×8 · walls 3', code: 'BQEICAAAAAAAAAAAAAACAQUBABiBGAQQAhA' },
  { level: 'veryhard', name: 'Loop 7×8 · walls', code: 'BQEHCAAAAAAAAAAAA0kKAEAAAJCAEAAA' },
  { level: 'veryhard', name: 'Loop 8×8 · walls 4', code: 'BQEICAAAAAAAAAAAAIghAAIsAAhAMBBUQAA' },
  { level: 'veryhard', name: 'Loop 7×7 · walls & tiles 2', code: 'BQEHBwAAAAAAQASAAwEBQAAEAAgA' },
  { level: 'veryhard', name: 'Path 8×8 · walls & tiles', code: 'BQQICAAVABIAAIAAEAAAAAAAIAAwwAACCAQEAAgA' },
  { level: 'veryhard', name: 'Path 7×7 · walls & tiles', code: 'BQQHBwANABgBAEACAAAACAAACAAAAAABEA' },
  { level: 'veryhard', name: 'Path 7×7 · walls', code: 'BQQHBwAQAAIAAAAAAAAABBRAAKAQEAoSAA' },
  { level: 'veryhard', name: 'Path 7×7 · walls 2', code: 'BQQHBwAXAA4AAAAAAAAIICIIAAAAQIoACA' },
  { level: 'veryhard', name: 'Path 8×8 · walls', code: 'BQQICAATAAMAAAAAAAAAAAAEAAAQEABAAhAAUEQI' },
  { level: 'veryhard', name: 'Numbers 7×6 · walls & tiles', code: 'BQgHBgAFACcAEAAaABwACwAAAAEAAAAAAAAAAABAAA' },
  { level: 'veryhard', name: 'Numbers 7×7 · walls', code: 'BQgHBwAIACgACgALABcAGAAPACYAHgAAAAAAAAAIAEAAICAAAAAA' },
  { level: 'veryhard', name: 'Numbers 8×8 · black tiles', code: 'BQgICAAIAB0ACQAVACYAOwAlADIABABAAAYADAAAAAAAAAAAAAAAAAAAAAA' },
];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
