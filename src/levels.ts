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
    name: 'One-Shot Minis',
    description: 'Try to solve each one in one go, from tail to head, without lifting a finger.',
    levels: [
      'BhCwErA',
      'BhCwJLY',
      'BhD0xrU',
      'BhDztq4',
      'BhE01LQ',
      'Bhj-Rvuw',
      'BhjxmLCA',
      'Bhl4uJfDKA',
      'BhFyOirA',
      'Bhk1qiuA',
      'Bhkzhjzp',
      'Bhl2Cqqg',
      'Bhm4IJjdngA',
      'BiEzCJOGAA',
    ],
  },
  {
    name: 'One-Shot: more',
    description: 'More one-shots, straight from the search: bigger boards, more obstacles.',
    levels: [
      'Bhj8VPOQ',
      'Bhj9VN0A',
      'Bhj-Rvuo',
      'Bhj55kpGQA',
      'Bhj-GLCA',
      'Bhk1xJDzAA',
      'BhkzERJjAA',
      'Bhk4RL2g',
      'Bhk4OJA-gA',
      'Bhk4Mblm',
      'Bhk1Nizg',
      'Bhk4IbXg',
      'Bhk3Lb9E',
      'BhkxPbzg',
      'Bhl4FRKoAA',
      'Bhl3lTeQ',
      'BiEzmJPIAA',
      'BiE0DJfwEA',
      'BiE4mRIOgA',
      'BiF5MRhoRkA',
      'BiFwtRtATQA',
      'BiFwjJs1KA',
      'BiG6DR6mQeA',
      'Bil6oRsjTsA',
    ],
  },
  {
    name: 'One-Shot: hard',
    description: 'One go from tail to head, but somewhere along the way the simple rules run out.',
    levels: [
      'BhkxpZdkqoA',
      'BhlzJZvA3dg',
      'BhlzkZe5jYA',
      'BhlzkZfOaMA',
      'BhmzoZf3MVA',
      'Bhn0mZvbN1U',
      'Bhn3HZ_id1Rg',
      'BiF6NZvYqjY',
      'BiF3uZvfYkI',
      'BilxIYj4ixWxAA',
      'Bil6xZ_04Aow',
      'Bhq6yYn8mCcGvAA',
      'Bin8pYz-YM4s0YRY',
      'BiJ-TYj_DsblggA',
      'BjG7qYi-Fz-54A',
      'BjGwZY78XMHE-KhFEA',
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
