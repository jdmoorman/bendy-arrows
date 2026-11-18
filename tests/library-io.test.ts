import { describe, expect, test } from 'vitest';
import { encodePuzzle } from '../src/codec';
import { exportText, parseImport } from '../src/library-io';
import { createPuzzle, portEnd } from '../src/model';
import type { LibraryEntry } from '../src/storage';

const A = encodePuzzle(createPuzzle(4, 4));
const B = encodePuzzle({ ...createPuzzle(5, 3), endpoints: [portEnd(0), portEnd(4)] });
const entry = (name: string, code: string, created: number): LibraryEntry => ({ id: name, name, code, created, updated: created });

describe('library export and import', () => {
  test('export is one "Name — link" line per puzzle, oldest first, and imports back', () => {
    const text = exportText([entry('Second', B, 2), entry('First: a — b', A, 1)], 'https://example.com/app/?x=1#p=old');
    expect(text).toBe(`First: a — b — https://example.com/app/#p=${A}\nSecond — https://example.com/app/#p=${B}\n`);
    expect(parseImport(text)).toEqual({ puzzles: [{ code: A, name: 'First: a — b' }, { code: B, name: 'Second' }], bad: 0 });
  });

  test('accepts bare links, fragments and codes, with or without names, and counts junk', () => {
    const text = [`https://x.io/#p=${A}`, '', `  #p=${B} My path `, `Loop ${A}`, 'not a puzzle', 'https://x.io/#p=%%%'].join('\r\n');
    expect(parseImport(text)).toEqual({
      puzzles: [{ code: A }, { code: B, name: 'My path' }, { code: A, name: 'Loop' }],
      bad: 2,
    });
  });
});
