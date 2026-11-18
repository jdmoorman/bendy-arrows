/**
 * Deductions that are easy by hand but that the logic rules don't make yet.
 *
 * Each entry is a puzzle and an edge you can prove by hand. `logic-wishlist.test.ts` checks that
 * the edge really is in the puzzle's solution (so a typo shows up straight away), and that the
 * rules, run until they stall, still miss it. When an improvement to the rules makes them find
 * it, that second test fails on purpose: move the entry to DONE below.
 *
 * To add one: copy the puzzle's link from the share button (the code is everything after
 * `#p=`), give the edge as two neighbouring tiles in "row,column" counted from 1 at the top
 * left, and describe how you see it. `area` is optional: the tiles of the region you'd use.
 */
export interface Wish {
  name: string;
  code: string;
  /** Two neighbouring tiles, "row,column" from 1: the line between them must be drawn. */
  edge: [string, string];
  /** The region you'd reason about, if any ("row,column" from 1). */
  area?: string[];
  /** How you'd find it by hand, and what the engine does instead. */
  note: string;
}

export const WISHES: Wish[] = [
  {
    name: 'Path 8×8 · walls 2 (was loop) (sample): a notched L of 16 tiles in the bottom right',
    code: 'BQQICAAOAA8AAAAAAAAAAIiAQiRAAQRAAEQAGAAA',
    edge: ['8,5', '8,4'],
    area: ['4,7', '4,8', '5,7', '5,8', '6,5', '6,6', '6,7', '6,8', '7,5', '7,6', '7,7', '7,8', '8,5', '8,6', '8,7', '8,8'],
    note:
      'Checkerboard balance on rows 4-5 cols 7-8 plus rows 6-8 cols 5-8: 8 shaded and 8 white tiles, ' +
      'and the only open border into a shaded tile is the one left of 8,5. Rooms never grow into it: ' +
      'tile 5,6 sits in the notch of the L and is always the cheapest tile to add. It has 5 exits, ' +
      'all fixed by walls, so a search for areas cut off by 4-5 borders would find it.',
  },
];

/** Wishes the rules now grant, kept as a record (and as regression tests). */
export const DONE: Wish[] = [
  {
    name: '10×10 path (was loop): an L of columns A-B and rows 9-10 (granted by chains)',
    code: 'BQQKCgASABMAAAAAAAAAAAAAAAAAQAAAAQAEABAAAAAAAAAAAAAAAEAFAA',
    edge: ['10,8', '10,9'],
    area: [
      ...['1', '2', '3', '4', '5', '6', '7', '8'].flatMap((r) => [`${r},1`, `${r},2`]),
      ...['9', '10'].flatMap((r) => ['1', '2', '3', '4', '5', '6', '7', '8'].map((c) => `${r},${c}`)),
    ],
    note:
      'H10-I10 (row 10, between columns H and I). Columns A-B plus rows 9-10 out to column H: 16 shaded and ' +
      '16 white tiles, and the only open border into a white tile is H10-I10. Before chains, only the ' +
      'one-step trial found it. Chains reaches the area from a smaller one by repeatedly adding the tile ' +
      'across a line it draws plus a neighbour. (The puzzle has several solutions; the argument holds for all.)',
  },
];
