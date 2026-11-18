import type { Difficulty } from './generator';

/**
 * The official levels: shipped to every player and shown in the library as "Levels".
 * (The samples in samples.ts are archived: only the local dev server shows them.)
 *
 * To publish a level:
 *   1. Make it in the Create tab. The Unique chip must be green.
 *   2. Running locally, tap "Copy level entry" beside the difficulty chip, and paste the
 *      line into LEVELS below (or write one by hand: the code is everything after `#p=`
 *      in the puzzle's share link). Give it a better name if you like.
 *   3. `npm test` checks every level: a unique solution, a difficulty that matches the
 *      rating, and no repeated names or codes.
 *   4. Commit and push to main. GitHub builds the site and publishes it to Pages.
 *
 * Players' progress and solve times are kept by a level's code, so changing a published
 * level's walls, tiles or ends resets everyone's progress on it.
 */
export interface Level {
  name: string;
  code: string;
  /** The difficulty the rating gives it (tests check this stays true). */
  level: Difficulty;
}

export const LEVELS: Level[] = [];
