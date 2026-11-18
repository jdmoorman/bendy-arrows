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

export const WISHES: Wish[] = [];

/** Wishes the rules now grant, kept as a record (and as regression tests). */
export const DONE: Wish[] = [];
