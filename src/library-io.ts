import { decodePuzzle, encodePuzzle } from './codec';
import type { LibraryEntry } from './storage';

/**
 * Moving a whole library between devices as a plain text file: one puzzle per line,
 * "Name — link". Only the puzzles travel (not progress or times).
 */

const SEPARATOR = ' — ';

/** The link that opens a puzzle code, on the site at `base` (any URL of the app). */
export function linkFor(code: string, base: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = `p=${code}`;
  return url.toString();
}

/** The export file: one "Name — link" line per entry, oldest first. */
export function exportText(entries: LibraryEntry[], base: string): string {
  return packText([...entries].sort((a, b) => a.created - b.created), base);
}

/** One "Name — link" line per puzzle, in the order given (a level pack keeps its order). */
export function packText(puzzles: { name: string; code: string }[], base: string): string {
  return puzzles.map((e) => `${e.name.trim()}${SEPARATOR}${linkFor(e.code, base)}`).join('\n') + '\n';
}

export interface ImportedPuzzle {
  /** Canonical share code. */
  code: string;
  /** The name on the line, if it had one. */
  name?: string;
}

/**
 * Read puzzles from text: each non-empty line holds a link (or "#p=…", or a bare code),
 * with the name before or after it. Lines that hold no readable puzzle are counted in `bad`.
 */
export function parseImport(text: string): { puzzles: ImportedPuzzle[]; bad: number } {
  const puzzles: ImportedPuzzle[] = [];
  let bad = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // A link or fragment carrying p=CODE, else a lone token that may be a bare code.
    const link = /\S*[#?&]p=([A-Za-z0-9_-]+)\S*/.exec(line);
    const candidates = link ? [{ code: link[1], rest: line.replace(link[0], ' ') }] : line.split(/\s+/).map((t) => ({ code: t, rest: line.replace(t, ' ') }));
    let found: ImportedPuzzle | null = null;
    for (const c of candidates) {
      if (!/^[A-Za-z0-9_-]+$/.test(c.code)) continue;
      try {
        const code = encodePuzzle(decodePuzzle(c.code));
        const name = c.rest.replace(/^[\s—–:|-]+|[\s—–:|-]+$/g, '').trim();
        found = name ? { code, name } : { code };
        break;
      } catch {
        // Not a puzzle code; try the next token.
      }
    }
    if (found) puzzles.push(found);
    else bad++;
  }
  return { puzzles, bad };
}
