import type { CodeDifficulty } from './codec';
import type { Rating } from './library-table';
import { hintJourney, strokeJourney } from './logic';
import { isOneShot, type Puzzle } from './model';

/**
 * A level's difficulty, as players see it (four dots) and the generator aims for: how many hints
 * a player alternating the easy rules and hints needs (for a one-shot, along its stroke), and
 * how big an area the hardest of them reasons about.
 *   easy      (1)  no hints;
 *   medium    (2)  a few (up to 3), none about a big area;
 *   hard      (3)  more (up to 7), or a hint about an area of more than 12 tiles;
 *   veryhard  (4)  an unreasonable number (8 or more), a hint about an area of more than 24
 *                  tiles, or hints alone get stuck.
 */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'veryhard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'veryhard'];
export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' };

/** What the hints took: how many, whether they got stuck, and the biggest area one reasoned about. */
export interface HintCount {
  hints: number;
  stuck: boolean;
  maxArea: number;
}

export function difficultyOf(h: HintCount): Difficulty {
  if (h.stuck || h.hints >= 8 || h.maxArea > 24) return 'veryhard';
  if (h.hints >= 4 || h.maxArea > 12) return 'hard';
  return h.hints ? 'medium' : 'easy';
}

/** The difficulty as a number, 1 (easy) to 4 (very hard), as share codes carry it. */
export function difficultyLevel(h: HintCount): CodeDifficulty {
  return (DIFFICULTIES.indexOf(difficultyOf(h)) + 1) as CodeDifficulty;
}

/** What a rating says the hints took (none if the puzzle isn't unique). */
export function ratingHints(r: Rating): HintCount | null {
  return r.unique && typeof r.hints === 'number' ? { hints: r.hints, stuck: !!r.hintsStuck, maxArea: r.maxArea ?? 0 } : null;
}

/** The hints a player needs for a puzzle (with a unique solution). */
export function countHints(p: Puzzle): HintCount {
  const j = isOneShot(p) ? strokeJourney(p) : hintJourney(p);
  return { hints: j.steps.length, stuck: j.outcome === 'stuck', maxArea: Math.max(0, ...j.steps.map((s) => s.area ?? 0)) };
}
