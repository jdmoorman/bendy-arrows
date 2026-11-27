import { decodePuzzle, encodePuzzle } from './codec';
import { endVariants, isOneShot, type Puzzle } from './model';
import { ALL_PACKS } from './levels';
import type { LibraryEntry, Storage } from './storage';

/** One of your saved puzzles, as a Library card. */
export interface LibRow {
  name: string;
  code: string;
  puzzle: Puzzle;
  entry: LibraryEntry;
  oneShot: boolean;
  /** The level pack it became a level of, if any: gained when added to a pack, lost when taken out. */
  pack?: string;
  /** Undefined while not checked yet. */
  unique?: boolean;
  /** Hints a player alternating easy rules and hints needs (undefined while not worked out, null if not unique). */
  hints?: number | null;
  /** The easy rules and hints got stuck before the end, so it takes more than `hints`. */
  hintsStuck?: boolean;
  /** Its one solution's lines, once worked out (null if it has none, or more than one). */
  segments?: number[] | null;
  solved: boolean;
}

/**
 * Bump when the logic changes in a way that changes ratings: older ratings are shown until
 * the background worker has redone them.
 */
export const RATING_VERSION = 16;

/** A puzzle's uniqueness and hint steps, worked out in the background for saved puzzles. */
export interface Rating {
  /** RATING_VERSION when it was worked out (missing before versions). */
  v?: number;
  unique: boolean;
  /** Steps beyond the easy rules: shown under the editor's board (missing in old ratings). */
  hints?: number | null;
  /** The hints ran out before the puzzle was solved. */
  hintsStuck?: boolean;
  /** The biggest area (in tiles) a hint had to reason about (Checkerboard balance, Bottlenecks); 0 if none. */
  maxArea?: number;
  /** How hidden the moves are (see searchMetrics in logic.ts); missing in old ratings. */
  tightest?: number | null;
  effort?: number | null;
  /** The one solution's lines, for the Library's cards (null if not unique; missing in old ratings). */
  segments?: number[] | null;
}

/** A rating to (re)do: missing, from older rules, or without the solution a card shows. */
export const needsRating = (r: Rating | undefined): boolean => !r || r.v !== RATING_VERSION || (r.unique && r.segments === undefined);

/** Collections: where saved puzzles came from (imports are named by you). */
export const COLLECTIONS = {
  yours: 'Yours',
};

/**
 * Your saved puzzles (never the shipped levels themselves), newest change first. One you made
 * and added to a pack shows that pack.
 */
export function libraryRows(storage: Storage, ratings: Record<string, Rating>): LibRow[] {
  // A saved puzzle that became a pack level (turned, mirrored, its corner arrows moved or made a
  // one-shot on the way, as the Packs tab does) shows that pack.
  const packOf = new Map<string, string>();
  for (const pack of ALL_PACKS) {
    for (const code of pack.levels) {
      try {
        for (const q of endVariants(decodePuzzle(code))) {
          packOf.set(encodePuzzle(q), pack.name);
          packOf.set(encodePuzzle({ ...q, oneShot: undefined }), pack.name);
        }
      } catch {
        /* an unreadable level is skipped */
      }
    }
  }
  const rows: LibRow[] = [];
  for (const e of storage.list()) {
    let puzzle: Puzzle;
    try {
      puzzle = decodePuzzle(e.code);
    } catch {
      continue;
    }
    const r = ratings[e.code];
    rows.push({
      name: e.name,
      code: e.code,
      puzzle,
      entry: e,
      oneShot: isOneShot(puzzle),
      // Compared re-encoded: a shipped code needn't be the one encodePuzzle writes now.
      pack: packOf.get(e.code) ?? packOf.get(encodePuzzle(puzzle)) ?? packOf.get(encodePuzzle({ ...puzzle, oneShot: undefined })),
      unique: r?.unique,
      hints: r?.hints,
      hintsStuck: r?.hintsStuck,
      segments: r?.segments,
      solved: storage.isSolved(e.code) || !!e.solved,
    });
  }
  return rows.sort((a, b) => b.entry.updated - a.entry.updated);
}
