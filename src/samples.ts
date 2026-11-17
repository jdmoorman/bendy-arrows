import { decodePuzzle } from './codec';
import type { Puzzle } from './model';

export type SampleLevel = 'easy' | 'medium' | 'hard' | 'veryhard';

/**
 * Built-in puzzles, each with a unique solution. The level is the logic
 * rating (see rateDifficulty): easy without Checkerboard balance, medium
 * with small balance areas, hard with bigger ones, very hard beyond every rule.
 */
/** Special collections shown in their own library section. */
export type SampleGroup = 'one';

export const SAMPLES: { level: SampleLevel; group?: SampleGroup; name: string; code: string }[] = [
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
  { level: 'easy', name: 'Numbers 7×6 · black tiles', code: 'BQgHBgAGACIACQASAAwAEAAdEAACAMAAAAAAAAAAAAAA' },
  { level: 'easy', name: 'Numbers 7×7 · walls', code: 'BQgHBwAIACgACgALABcAGAAPACYAHgAAAAAAAAAIAEAAICAAAAAA' },
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
  { level: 'veryhard', name: 'Numbers 8×8 · black tiles', code: 'BQgICAAIAB0ACQAVACYAOwAlADIABABAAAYADAAAAAAAAAAAAAAAAAAAAAA' },
  // Sparse: the medium and hard puzzles that are unique with one obstacle (or none),
  // from an exhaustive search; mirror images and rotations are listed once.
  { level: 'medium', group: 'one', name: 'Path 4×4 · 1 wall #1', code: 'BQQEBAAAAAMAAIAAAA' },
  { level: 'medium', group: 'one', name: 'Path 4×4 · 1 wall #2', code: 'BQQEBAAAAA8AAAAABA' },
  { level: 'medium', group: 'one', name: 'Path 4×4 · 1 wall #3', code: 'BQQEBAAAAAgAAAAABA' },
  { level: 'medium', group: 'one', name: 'Path 6×3 · no obstacles', code: 'BQQGAwACAAwAAAAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 5×4 · 1 wall #1', code: 'BQQFBAAAAAYAAAAgAAAA' },
  { level: 'medium', group: 'one', name: 'Path 5×4 · 1 wall #2', code: 'BQQFBAAFAA8AAABAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 5×4 · 1 wall #3', code: 'BQQFBAAGAAcAAAAAAAQA' },
  { level: 'medium', group: 'one', name: 'Path 6×4 · 1 wall #1', code: 'BQQGBAAAAAUAAAAAAAIAAA' },
  { level: 'medium', group: 'one', name: 'Path 6×4 · 1 wall #2', code: 'BQQGBAAAAAYAAAAAAAIAAA' },
  { level: 'medium', group: 'one', name: 'Path 6×4 · 1 wall #3', code: 'BQQGBAACAAwAAAAAAABAAA' },
  { level: 'medium', group: 'one', name: 'Path 6×4 · 1 wall #4', code: 'BQQGBAAGABAAAAAAAAIAAA' },
  { level: 'medium', group: 'one', name: 'Path 6×4 · 1 wall #5', code: 'BQQGBAAHABEAAAAAEAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #1', code: 'BQQIAwACAA4AAAAgAAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #2', code: 'BQQIAwACAA4AAAAAAAgAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #3', code: 'BQQIAwACAA4AAAAAAAAEAA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #4', code: 'BQQIAwACAA4AAAAAAAAIAA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #5', code: 'BQQIAwACAA4AAAAAAAAABA' },
  { level: 'medium', group: 'one', name: 'Path 8×3 · 1 wall #6', code: 'BQQIAwACAA4AAAAAAAAACA' },
  { level: 'medium', group: 'one', name: 'Path 7×4 · 1 wall #1', code: 'BQQHBAAAAAgAAAAAAAABAAAA' },
  { level: 'medium', group: 'one', name: 'Path 7×4 · 1 wall #2', code: 'BQQHBAABAAwAAAAAAAAAAAEA' },
  { level: 'medium', group: 'one', name: 'Path 7×4 · 1 wall #3', code: 'BQQHBAADAA4AAAAAAAAAAAEA' },
  { level: 'medium', group: 'one', name: 'Path 7×4 · 1 wall #4', code: 'BQQHBAAHABMAAAAAAAACAAAA' },
  { level: 'medium', group: 'one', name: 'Path 6×5 · 1 wall', code: 'BQQGBQABAAcAAAAAAEAAAAAA' },
  { level: 'medium', group: 'one', name: 'Path 8×4 · 1 wall', code: 'BQQIBAAJABUAAAAAAAAAAQAAAA' },
  { level: 'hard', group: 'one', name: 'Path 6×4 · 1 wall #6', code: 'BQQGBAACAAwAAAAAAAQAAA' },
  { level: 'hard', group: 'one', name: 'Path 7×4 · 1 wall #5', code: 'BQQHBAADAA4AAAAAAAAEAAAA' },
  { level: 'hard', group: 'one', name: 'Path 8×5 · 1 wall', code: 'BQQIBQAJABYAAAAAAAAAAAEAAAAAAA' },
];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
