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
  { level: 'easy', name: 'Path 6×6 · walls & tiles', code: 'BilpJYnMi-AjkQA' },
  { level: 'easy', name: 'Path 6×6 · walls', code: 'BilpBZ_8CJ0E' },
  { level: 'easy', name: 'Path 6×6 · black tiles', code: 'BilkJR-hTLA' },
  { level: 'medium', name: 'Path 7×6 · walls & tiles', code: 'BjFqTYq4f7jUBEA' },
  { level: 'medium', name: 'Path 7×7 · walls & tiles', code: 'BjGqpYnPkk2cegA' },
  { level: 'medium', name: 'Path 8×8 · walls', code: 'BjniKYQ_4EqBQAFNEbaA' },
  { level: 'hard', name: 'Path 6×6 · walls', code: 'BilqpZ_dxPwA' },
  { level: 'medium', name: 'Path 7×7 · walls', code: 'BjGhLYr-SEN9QHQ' },
  { level: 'hard', name: 'Path 7×7 · walls 2', code: 'BjGmyYv85OBKA4GA' },
  { level: 'hard', name: 'Path 8×8 · walls 2', code: 'BjnlNYR_4CYkMmPitlVC' },
  { level: 'hard', name: 'Path 7×7 · walls 3', code: 'BjGrrY3-EZbAoIIyAA' },
  { level: 'veryhard', name: 'Path 8×8 · walls & tiles', code: 'BjnqyY3en4WCARiz4A' },
  { level: 'hard', name: 'Path 7×7 · walls & tiles 2', code: 'BjGtqYhsC67_MQ' },
  { level: 'veryhard', name: 'Path 7×7 · walls', code: 'BjGrpY3-KEBA46XkIA' },
  { level: 'veryhard', name: 'Path 7×7 · walls 2', code: 'BjGruYv84ma-RCcw' },
  { level: 'hard', name: 'Path 8×8 · walls', code: 'BjntrYz_oSwGQHi1AA' },
  // Sparse: medium and hard puzzles that are unique with one obstacle, from an
  // exhaustive search. Mirror images and rotations are listed once. Samples smaller
  // than 30 tiles, or only 3 tiles wide or tall, are left out.
  { level: 'medium', group: 'one', name: 'Path 6×5 · 1 wall', code: 'Bikgni3A' },
  { level: 'medium', group: 'one', name: 'Path 8×4 · 1 wall', code: 'BjjqpqsA' },
  { level: 'hard', group: 'one', name: 'Path 8×5 · 1 wall', code: 'BjkrJqwA' },
  // Fewest obstacles the generator found for each size (sparsity research).
  { level: 'easy', group: 'fewest', name: 'Path 6×6 · 2 obstacles', code: 'BilkvjR7AA' },
  { level: 'medium', group: 'fewest', name: 'Path 7×7 · 3 obstacles #1', code: 'BjGqohLs0QA' },
  { level: 'easy', group: 'fewest', name: 'Path 7×7 · 3 obstacles #2', code: 'BjGi7hNlWEA' },
  { level: 'medium', group: 'fewest', name: 'Path 8×8 · 6 obstacles', code: 'Bjnsvh7BauDOMA' },
  { level: 'easy', group: 'fewest', name: 'Path 8×8 · 8 obstacles', code: 'BjnkzgkfzLmK86A' },
  { level: 'easy', group: 'fewest', name: 'Path 9×9 · 10 obstacles', code: 'BkInzYLmkldcU1DrAA' },
  { level: 'easy', group: 'fewest', name: 'Path 9×9 · 14 obstacles', code: 'BkInyWP6nJGzeJj4By_M' },
  { level: 'medium', group: 'fewest', name: 'Path 10×10 · 17 obstacles', code: 'BkphY2Eiz88NMS0RUx7j5TzA' },
  { level: 'easy', group: 'fewest', name: 'Path 10×10 · 26 obstacles', code: 'Bkpg4GG__7XABGNARzDdaoAgMknCQA' },
  // Hard puzzles with the fewest obstacles a 40-minute generator search found (research/hard-sparse).
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 7 obstacles', code: 'BjnjigjEThwmNOA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 8 obstacles', code: 'BjnuUglupBg4cag' },
  { level: 'hard', group: 'hardsparse', name: 'Path 8×8 · 9 obstacles', code: 'BjntKYr_HumzYSIw' },
  { level: 'hard', group: 'hardsparse', name: 'Path 9×9 · 13 obstacles', code: 'BkInz2OzI9JB_6DPaYkA' },
  { level: 'medium', group: 'hardsparse', name: 'Path 9×9 · 14 obstacles #1', code: 'BkIghGPrkxUDrOHkH2Xc' },
  { level: 'hard', group: 'hardsparse', name: 'Path 9×9 · 14 obstacles #2', code: 'BkIgi2P_-miqpljghbKY' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 19 obstacles', code: 'BkphBmFH-_XiAp-5D5CTkK1g' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 21 obstacles #1', code: 'BkphAmFvv_GoDEBLU59raI6iJA' },
  { level: 'hard', group: 'hardsparse', name: 'Path 10×10 · 21 obstacles #2', code: 'BkphDGFv_8GyYyuxIkDKkEFcVA' },
];

/**
 * The samples are archived: the library shows them only when the app runs locally (the dev
 * server, or tests and research scripts). A production build leaves them out entirely.
 */
export const LOCAL_SAMPLES = import.meta.env.DEV ? SAMPLES : [];

export function samplePuzzle(i = 0): Puzzle {
  return decodePuzzle(SAMPLES[i].code);
}
