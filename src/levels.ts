import { plainCode } from './codec';

/**
 * The official level packs: what players see in the Levels tab (and the creator's Library
 * lists each pack as a collection).
 *
 * To publish a level:
 *   1. Make it in the creator (create.html). It must have exactly one solution (the hint count
 *      shows under the board).
 *   2. Running locally, tap "Copy level entry" beside the hint count, and paste the
 *      line into a pack's `levels` below (or write the code by hand: everything after
 *      `#p=` in the puzzle's share link). Levels play in the order listed.
 *   3. `npm test` checks every pack: a name, at least one level
 *      (any number past that), each no more than twice as long as it is wide (either way up), with
 *      exactly one solution, and no level used twice (not even turned, mirrored or with its
 *      ends swapped).
 *   4. Commit and push to main. GitHub builds the site and publishes it to Pages.
 *
 * Each code carries the level's difficulty, so players see it without working it out; `npm
 * test` checks it's right, and `npm run rate-levels` puts it right.
 *
 * Players' progress is kept by a level's code (less its difficulty), so changing a published
 * level's walls, tiles or ends resets everyone's progress on it.
 */
export interface LevelPack {
  name: string;
  /** Share codes, in play order. */
  levels: string[];
  /** Every level is a one-shot (and only such packs hold one-shots). */
  oneShot?: boolean;
}

export const PACKS: LevelPack[] = [
  {
    name: 'Sparse',
    levels: [
      'ByIdliA',
      'ByIdqiA',
      'ByIdiCA',
      'ByMlA4g',
      'ByMlAyWg',
      'ByM1STVw',
      'B0MkkMW0',
      'B0MtE8W4',
      'B0QtQNWQ',
      'B2M1I9WC',
    ],
  },
  {
    name: 'Symmetric',
    levels: [
      'B0Y93SP6B4IA',
      'B0Y9qKGhLwBAHhI',
      'B0U9ACP6gBA',
      'B0VFtSEi7yM3YA',
      'B0VN9qFvUoTaXAA',
      'B0ZF3KExT6PToA',
      'B0ZF1qEroVuh0A',
      'B0c9xiFiNkfBG4A',
      'B0VNHKGpK8iBm0g',
      'B2c95yExcr4U2A',
      'B2Y9waEitTU6oA',
      'B2ZMm8h6C6QqKC6Q',
      'B2U1lCP0FCA',
      'B2U9AiL6UIA',
      'B2VE8qE9CBiOgA',
      'B2dNEYhMb3m5fsA',
      'B2VE-TLRMkA',
      'B4hNLEhcYp-l6dYA',
      'B2dNEUha0L1fxQY',
      'B2Y9FqP6Sas',
      'B4hFG-hKf4PJ_DA',
      'B4ZMmShO4rQ1UA',
      'B4hMrIxK6oeBpqA',
      'B4hMu0xJFDXDWBA',
      'B4dEoMhfpQlSUIA',
    ],
  },
  {
    name: 'Near-Symmetric',
    levels: [
      'B0VF1yPfC6Vg',
      'B0ZMmejrwq1o',
      'B2U9ACPwlCQ',
      'B2VE8qF9BJTKgA',
      'B2U9liNfBFg',
      'B2ZF36E6EPw2AA',
      'B0VNHqO9XL4A',
      'B0VNHaPOjOeA',
      'B0VFuCE3agQr',
      'B0VN1qFqTqBGjIA',
      'B2VNKrKWqag',
      'B2VU9Cj9J-YQ',
      'B2dMoAzlzCAcwA',
      'B2Y9vqFIY0BrAA',
      'B2Y9JqNnFVA',
      'B2dNFGhfA1d1d6A',
      'B2Y9IiEdKQJQ',
      'B2ZMk-haG09NbAA',
      'B4Y9yJEwN_80AA',
      'B4dcoqxc6KGKYgtA',
    ],
  },
  {
    name: 'ABCs',
    levels: [
      'BydVI6gjexKhcACFC6A',
      'BydUsoghegMRZlQoPoA',
      'BydVG2gheEJUKLtSPQA',
      'B0dVCogjegMQoVwoA9A',
      'B0dUoCQh_wDN9Az-gA',
      'B0dVE6gj6AETkARdrpA',
      'B0dVGEwm8CBSo4ghL_av-W5A',
      'B4dVCYwhkSFQAChIWg___mA',
      'B2dUoKwrkAWd7AHfCavnyNqaAA',
      'B2dVEUwjq7ukA7Jp6-I-SxA',
      'B2dU8agj6UKkgHlQs2A',
      'B4dUYcwnk4kToTuAB09f7gg',
      'BylUOWwwuBmQASuampqeX-P_o-NQ',
      'B2hVKawuWBoBIBIAMQIaGX__L-Y',
    ],
  },
  {
    name: 'Fancy Paths',
    levels: [
      'BydNGShIb_uv0wA',
      'ByhFA-whIEha0EC3rw7zQA',
      'B4c9zbHRTyTJ8D1q5aA',
      'B4ZVGiwh__alKkMSFCgMxA',
      'B4c997Gf-0Eg9RGg4A',
    ],
  },
  {
    name: 'Spaghetti',
    levels: [
      'B2Us4UerQA',
      'B2Y1IUPyDqHEkA',
      'B4c9McN5Gg8jAA',
      'B2hEsIxn_nPTUoeYgRg',
      'B4Y9IdfWTA',
      'B4lMwNB35oG1rHcgIHGj',
      'B4pVDGwr__zEsyc0ZfiQ6rlZeBg',
      'B4hUwIwp_-tSYUxB2k3ACjWhAA',
      'B4dMqHBP44ygz2Ba',
      'B4tc8Mw7__-Sdim0pNbJB4M5ZCAgQBpZgA',
    ],
  },
  {
    name: 'Misc Classic',
    levels: [
      'Byc9MbLIuaA',
      'ByZFIiPSz3ww',
      'B2c8pLHf819zOEiEjOA',
    ],
  },
  {
    name: 'One-Shot Minis',
    oneShot: true,
    levels: [
      'ByIXdFYA',
      'ByIXapbA',
      'ByInylYA',
      'ByMfyN92',
      'ByIvAzWg',
      'ByMmpcVw',
      'ByMnAUeooA',
      'ByMusNVI',
      'ByM3QyMNqiA',
      'ByQnJiJxAA',
    ],
  },
  {
    name: 'One-Shot Midis',
    oneShot: true,
    levels: [
      'ByQuxEfYMA',
      'ByQvRDN7qMJg',
      'ByUvdCMJz2g',
      'ByQ3RrKmeXE',
      'ByQ_ZTEfJZ9EUw',
      'ByUvdDJQcQ',
      'ByRHsrE_2IZIKiA',
      'ByY3oqPwTriA',
      'ByU24ENwZjAQ',
      'ByY3pKEOODiW',
      'ByRHdbEfYoknsoA',
      'ByY3mTE_mxL5SRA',
      'ByY_JaEVQXek',
      'ByY_AaOvI-SA',
      'ByY_1LF_8TTCgKp0',
    ],
  },
  {
    name: 'Tricky One-Shots',
    oneShot: true,
    levels: [
      'B0Uva7P743di',
      'B2RPxzEf4djcsEA',
      'B0Y_zKE1YGJ7gA',
      'B0Y3piO6fmaA',
      'B2U--7GfzJgQxlEH',
      'B0Y3qCFLGCKU4A',
      'B2U3i7FfsayKLm4',
      'B2Y3mqEqlptZ',
      'B2Uva7FfEdCdBJQ',
      'B2UvU6OMw-gA',
      'B2UvWjE-shUdnIA',
      'B0Y3kjF_pMndEYUA',
      'B2U_lLGfzBnFmjCLAA',
      'B0Y_sqFZTmNRhA',
      'B2U3ezE9YRAZ43A',
      'B2Q-0jE_lUJyIXA',
      'B0Q_crFfiaaoxgw',
      'B2c_5aGRcdUCouA',
      'B2U25LEf2vMxJA',
      'B2Y_zCFZ4igAOg',
    ],
  },
  {
    name: 'Harder One-Shots',
    oneShot: true,
    levels: [
      'B0Y3AiEhKrWI',
      'B0c_6SFy3Ek_0EA',
      'B2dG-Yh88IaCthBb',
      'B4dG8Sh6HbLuAcIa',
      'B2dHCghszMRFI9iA',
      'B4lPGagrcZCMLoDCa5cBAA',
      'B2hOo-Qjn9h_Fng2JA',
      'B4hWw4QuZJO8C7Nw_0DbgA',
      'B4hPCeQv0nLgU2fCHM5IAA',
      'B2hGsIhoobTfExpA',
      'B2lPGuQ3PX8rQciA_wGwsA',
      'B2hHCMgj3CQWBkAbwkA',
      'B4hGoEhoXlRpEXPg',
      'B4lPNCQqYH_-gs5wM6-ygA',
      'B4lGwIxZJWLrZCsA',
      'B4lWuEglyKyoSHTMclUA',
      'B4hWsMgnhfhAL0AgQlgA',
      'B4ZHIjOcku2Y',
      'B4lOwIhoEzi8ftVK',
      'B4te6Kgqw1AE1HdfD9rodsA',
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

/** Where a puzzle code appears in the packs, if it does (whatever difficulty either code carries). */
export function findLevel(code: string): LevelRef | undefined {
  const plain = plainCode(code);
  for (let pack = 0; pack < PACKS.length; pack++) {
    const level = PACKS[pack].levels.findIndex((c) => plainCode(c) === plain);
    if (level >= 0) return { pack, level };
  }
  return undefined;
}
