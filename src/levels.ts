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
 * Players' progress is kept by a level's code, so changing a published level's walls,
 * tiles or ends resets everyone's progress on it.
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
      'BhDssQ',
      'BhDtUQ',
      'BhDsQQ',
      'BhkoHEA',
      'BhkoGS0A',
      'BhmqSauA',
      'Bhkkhi2g',
      'Bhloni3A',
      'BiFqBqyA',
      'BhmpHqwQ',
    ],
  },
  {
    name: 'Symmetric',
    levels: [
      'BjHu6R_QPBA',
      'BjHtRQ0JeAIA8JA',
      'BinoAR_UAIA',
      'BiotqQkXeRm7',
      'BipvtQt6lCbS4A',
      'BjIu5QmKfR6dAA',
      'BjIutQldCt0OgA',
      'BjnuMQsRsj4I3AA',
      'Bipo5Q1JXkQM2kA',
      'BjnvOQmLlfCmwA',
      'BjHuDQkVqanVAA',
      'BjJk3kPQXSFRQXSA',
      'BimsoR-goQA',
      'BinoERfShA',
      'BionlQnoQMR0AA',
      'BjpojEJje83L9g',
      'BionyZaJkgA',
      'BkJpYkLjFP0vTrA',
      'BjpoikLWher-KDA',
      'BjHotR_STVg',
      'BkIo30JT_B5P4YA',
      'BjJkyUJ3FaGqgA',
      'BkJlZGJXVDwNNQ',
      'BkJl2mJIoa4awIA',
      'BjolBkL9KEqShA',
    ],
  },
  {
    name: 'Near-Symmetric',
    levels: [
      'BiouuR74XSs',
      'BjJkz0deFWtA',
      'BinoAR-EoSA',
      'BionlQvoJKZUAA',
      'BinssRr4IsA',
      'BjIu_QnQh-Gw',
      'Bipo9R3q5fA',
      'Bipo7R50ZzwA',
      'BiotwQm7UCFY',
      'BiputQtSdQI0ZA',
      'BippVZS1TUA',
      'BiqnoUfpPzCA',
      'BjplAGcuYQDm',
      'BjHt9QpDGgNYAA',
      'BjHpNRs4qoA',
      'Bjpoo0L4GrurvQA',
      'BjHpEQjpSBKA',
      'BjJkn0LQ2nprYA',
      'BjHuRImBv_mg',
      'BjrlFWLnRQxTEFoA',
    ],
  },
  {
    name: 'ABCs',
    levels: [
      'BjqpHUEb2JULgAQoXQA',
      'BjqllEEL0BiLMqFB9A',
      'Bjqo20ELwhKhRdqR6A',
      'BjqoVEEb0BiFCuFAHoA',
      'BjqlASEP-AZvoGf0AA',
      'BjqonUEfQAicgCLtdIA',
      'BjqowmE3gQKVHEEJf7V_y3I',
      'BjqoTGEMiQqAAUJC0H__8w',
      'BjqlBWFcgCzvYA74TV8-RtTQ',
      'BjqoimEdXd0gHZNPXxHyWIA',
      'BjqnjUEfShUkA8qFmw',
      'BjqjDmE8nEidCdwAOnr_cEA',
      'Bkqhy2GFwMyACVzU1NTy_x_9HxqA',
      'BkKpTWFywNAJAJABiBDQy__5fzA',
    ],
  },
  {
    name: 'Fancy Paths',
    levels: [
      'BjpoyUJDf91-mA',
      'BkIoH2EJAkLWggW9eHeaAA',
      'BjnubY6KeSZPgetXLQA',
      'BjKo0WEP_7UpUhiQoUBmIA',
      'BjnvvYz_2gkHqI0HAA',
    ],
  },
  {
    name: 'Spaghetti',
    levels: [
      'BilnCj1aAA',
      'BjGpCh-QdQ4kgA',
      'BjnpjhvI0HkY',
      'BkIlhGM_856alDzECMA',
      'BjHpDr6yYA',
      'BkpmBoO_NA2tY7kBA40Y',
      'BlKoY2Ff_-YlmTmjL8SHVcrLwMA',
      'BkKmBGFP_1qTCmIO0m4AUa0I',
      'BjplQ4J_HGUGewLQ',
      'BlrnhmHf__yTsU2lJrZIPBnLIQECANLM',
    ],
  },
  {
    name: 'Misc Classic',
    levels: [
      'BjnpjZZFzQA',
      'BjIpER6We-GA',
      'BjnlJY7_mvuZwkQkZwA',
    ],
  },
  {
    name: 'One-Shot Minis',
    oneShot: true,
    levels: [
      'BhC7orA',
      'BhC7VLY',
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
    oneShot: true,
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
      'BjH4DR15HyQA',
      'BjH-pYv_iaYUBVOg',
    ],
  },
  {
    name: 'Tricky One-Shots',
    oneShot: true,
    levels: [
      'Bil7XZ_fG7sQ',
      'BiJ-OYj_DsblggA',
      'BjH-ZQmrAxPcAA',
      'BjG9MR3T8zQ',
      'Bin33Yz-ZMCGMog4',
      'BjG9QQpYwRSnAA',
      'Bim8XYr9jWRRc3A',
      'BjG81QlUtNrI',
      'Bil7XYr4joToJKA',
      'Bil6nRxmH0A',
      'Bil60Yn1kKjs5A',
      'BjG8kYv9Jk7ojCg',
      'Bin8pYz-YM4s0YRY',
      'BjH9lQrKcxqMIA',
      'Bim72YnrCIDPG4A',
      'BiH2kYn8qhORC4A',
      'BiH7lYr8TTVGMGA',
      'Bjn_LQyLjqgVFwA',
      'Bim3JYj-15mJIA',
      'BjH-YQrPEUAB0A',
    ],
  },
  {
    name: 'Misc One-Shots',
    oneShot: true,
    levels: [
      'BjG4EQkJVaxA',
      'Bjn_SQuW4kn-gg',
      'Bjo3zEPnhDQVsILY',
      'Bjo3iUPQ7ZdwDhDQ',
      'Bjo4UENmZiIpHsQA',
      'Bkp4zUFbjIRhdAYTXLgI',
      'BkJ1HyEc_sP4s8GxIA',
      'BkK2HCFzJJ3gXZuH-gbc',
      'BkJ4TyF-k5cCmz4Q5nJA',
      'BkI1hENFDab4mNI',
      'Bkp41yG56_laDkQH-A2FgA',
      'BkI4RkEe4SCwMgDeEg',
      'BkI1AkNC8qNIi58A',
      'Bkp5oSFTA__0FnOBnX2U',
      'Bko2BGLJKxdbIVg',
      'Bkq1wkEuRWVCQ6Zjkqg',
      'BkK1hkE8L8IBegECEsA',
      'BjI5EZzkl2zA',
      'Bkp2BENAmcXj9qpQ',
      'Blr3RUFWGoAmo7r4ftdDtg',
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
