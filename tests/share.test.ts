import { describe, expect, test } from 'vitest';
import { encodePuzzle, puzzleToJson } from '../src/codec';
import { createPuzzle, puzzlesEqual } from '../src/model';
import { puzzleFromHash, puzzleFromText } from '../src/share';

describe('share parsing', () => {
  const p = createPuzzle(5, 4, 'cycle');
  p.blocked.add(3);
  const code = encodePuzzle(p);

  test('hash', () => {
    expect(puzzlesEqual(puzzleFromHash(`#p=${code}`)!, p)).toBe(true);
    expect(puzzleFromHash('#other')).toBeNull();
  });

  test('link, fragment, code and JSON text', () => {
    for (const t of [`https://example.test/app/#p=${code}`, `#p=${code}`, ` ${code} `, `https://x.test/?p=${code}`, JSON.stringify(puzzleToJson(p))]) {
      expect(puzzlesEqual(puzzleFromText(t), p)).toBe(true);
    }
  });

  test('empty text is an error', () => {
    expect(() => puzzleFromText('  ')).toThrow();
  });
});
