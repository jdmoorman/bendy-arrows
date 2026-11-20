/**
 * The official level packs: what players see in the Levels tab (and the creator's Library
 * lists each pack as a collection).
 *
 * To publish a level:
 *   1. Make it in the creator (create.html). The Unique chip must be green.
 *   2. Running locally, tap "Copy level entry" beside the difficulty chip, and paste the
 *      line into a pack's `levels` below (or write the code by hand: everything after
 *      `#p=` in the puzzle's share link). Levels play in the order listed.
 *   3. `npm test` checks every pack: a name, a description, at least MIN_PACK_LEVELS
 *      levels, each at least as tall as it is wide (phones are held upright) and with
 *      exactly one solution, and no code used twice.
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

export const PACKS: LevelPack[] = [
  {
    name: 'Zeros and Ones',
    description: 'Puzzles with at most one obstacle, yet still a unique solution.',
    levels: [
      'BhDssQ',
      'BhDtUQ',
      'BhDsQQ',
      'BhjuYQ',
      'BhkoHEA',
      'BhkoGS0A',
      'BhmqSauA',
      'Bhkohi2g',
      'BhmqhqwA',
      'Bhloni3A',
      'BiFqBqyA',
      'BhmpHqwQ',
    ],
  },
  {
    name: 'Single Stroke Minis',
    description: 'Try to solve each one in one go, from tail to head, without lifting a finger.',
    levels: [
      'BhCgErA',
      'BhCgJLY',
      'BhDkxrU',
      'BhDjtq4',
      'BhEk1LQ',
      'BhEk1qw',
      'BhjuRvuw',
      'BhjhmLCA',
      'BhFiOirA',
      'BhklqiuA',
      'Bhkjhjzp',
      'BhlouJfDKA',
      'BhlmCqqg',
      'BhmoIJjdngA',
      'BiEjCJOGAA',
    ],
  },
  {
    name: 'Single Stroke: more',
    description: 'More single strokes, straight from the search: bigger boards, more obstacles.',
    levels: [
      'BhjsVPOQ',
      'BhjtVN0A',
      'BhjuRvuo',
      'Bhjp5kpGQA',
      'BhjuGLCA',
      'BhjlqLEA',
      'BhklxJDzAA',
      'BhkjERJjAA',
      'BhkoRL2g',
      'BhkoOJA-gA',
      'BhkoMblm',
      'BhklNizg',
      'BhkoIbXg',
      'BhknLb9E',
      'BhkhPbzg',
      'BhkoCj2i',
      'BhloFRKoAA',
      'BhlooRMiwA',
      'BhlnlTeQ',
      'BiEjmJPIAA',
      'BiEkDJfwEA',
      'BiEomRIOgA',
      'BiFpMRhoRkA',
      'BiFgtRtATQA',
      'BiFgjJs1KA',
      'BiGqDR6mQeA',
      'BilqoRsjTsA',
    ],
  },
  {
    name: 'Single Stroke: hard',
    description: 'One stroke from tail to head, but somewhere along the way the simple rules run out. Try one-stroke mode in Settings.',
    levels: [
      'BhkhpZdkqoA',
      'BhlnPhMSGA',
      'BiEppZfBKqA',
      'BhmpVZe6bOA',
      'BiFnPZ_QjA8A',
      'BhnrXhc60uA',
      'BiGhMYj4DKcQgA',
      'BilqxZ_04Aow',
      'BhosqYj6HCSRIA',
      'BhprZZvutm0A',
      'BiHqlYj40ZIvUA',
      'BimkJYj8VJVvgA',
      'BhqlHZ_1itF2',
      'BiItiYn9nQsY1IA',
      'BinspYz-YM4s0YRY',
      'BhrqrYj-Qi4_Ug',
      'BjGhZYr9zQIEcvQ',
      'BiJibYj9Mz7C8g',
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
