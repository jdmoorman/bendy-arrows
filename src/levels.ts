/**
 * The official level packs: what players see in the Levels tab (and the creator's Library
 * lists each pack as a collection).
 *
 * To publish a level:
 *   1. Make it in the creator (create.html). The Unique chip must be green.
 *   2. Running locally, tap "Copy level entry" beside the hint count, and paste the
 *      line into a pack's `levels` below (or write the code by hand: everything after
 *      `#p=` in the puzzle's share link). Levels play in the order listed.
 *   3. `npm test` checks every pack: a name, a description, at least MIN_PACK_LEVELS
 *      levels, each at least as tall as it is wide (phones are held upright) but no more
 *      than twice as tall, and with
 *      exactly one solution, and no level used twice (not even turned, mirrored or with its
 *      ends swapped).
 *   4. Commit and push to main. GitHub builds the site and publishes it to Pages.
 *
 * Players' progress is kept by a level's code, so changing a published level's walls,
 * tiles or ends resets everyone's progress on it.
 */
export interface LevelPack {
  name: string;
  description: string;
  /** Share codes, in play order. */
  levels: string[];
}

/** Every pack has at least this many levels. */
export const MIN_PACK_LEVELS = 10;
/** A soft target: a pack's size is best a multiple of this (the Packs tab nudges, nothing enforces it). */
export const PACK_SIZE_STEP = 5;

export const PACKS: LevelPack[] = [
  {
    name: 'Zeros and Ones',
    description: 'Puzzles with at most one obstacle, yet still a unique solution.',
    levels: [
      'BhDssQ',
      'BhDtUQ',
      'BhDsQQ',
      'BhkoHEA',
      'BhkoGS0A',
      'BhmqSauA',
      'Bhkohi2g',
      'Bhloni3A',
      'BiFqBqyA',
      'BhmpHqwQ',
    ],
  },
  {
    name: 'One-Shot Minis',
    description: 'Try to solve each one in one go, from tail to head, without lifting a finger.',
    levels: [
      'BhC7orA',
      'BhC7lrM',
      'BhE-UrA',
      'Bhj-Rvuw',
      'BhF4Ga0A',
      'Bhk1LiuA',
      'Bhk4Cj1F',
      'Bhl1hqpA',
      'Bhm6GRhtUQ',
      'BiE5MROIAA',
    ],
  },
  {
    name: 'One-Shot Midis',
    description: 'Try to solve each one in one go, from tail to head, without lifting a finger.',
    levels: [
      'BiF2Ij7BgA',
      'BiF6IZvdRhM',
      'Bil7oRhOe0A',
      'BiG6NZUzy4g',
      'BiH7KYj5LPoimA',
      'Bil7oZKDiA',
      'BiI9lYn-xDJBUQ',
      'BjG9FR-CdcQA',
      'Bim3AhuDMYCA',
      'BjG9JQhxwcSw',
      'BiI7rYj7FEk9lA',
      'BjG8yYn82JfKSIA',
      'BjH5LQiqC70g',
      'BjH-pYv_iaYUBVOg',
      'BjH4DR15HyQA',
    ],
  },
  {
    name: 'One-Shot: hard',
    description: 'One go from tail to head, but somewhere along the way the simple rules run out.',
    levels: [
      'Bhk0jZeaKoA',
      'Bhl4uZupyZw',
      'Bhl4uZe4nUA',
      'Bhl4uZfGxQA',
      'Bhm5TZf2NRA',
      'Bhn6yZvhg8RA',
      'Bhn2zZ_mOAyA',
      'BiF6NZvYqjY',
      'BiF1sZvhmwkA',
      'Bil6iYj8RKshiA',
      'Bil6xZ_04Aow',
      'Bin8pYz-YM4s0YRY',
      'BiJ-TYj_DsblggA',
      'BjG8qggy1dS5Bg',
      'BjG9yY7-ZApYJUDdBA',
    ],
  },
];

/** A level's place: which pack, and which level in it (both from 0). */
export interface LevelRef {
  pack: number;
  level: number;
}

/** A level's display name: its pack and its number, e.g. "Zeros and Ones 3". */
export function levelName(ref: LevelRef): string {
  return `${PACKS[ref.pack].name} ${ref.level + 1}`;
}

/** Where a puzzle code appears in the packs, if it does. */
export function findLevel(code: string): LevelRef | undefined {
  for (let pack = 0; pack < PACKS.length; pack++) {
    const level = PACKS[pack].levels.indexOf(code);
    if (level >= 0) return { pack, level };
  }
  return undefined;
}
