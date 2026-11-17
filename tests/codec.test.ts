import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle, puzzleFromJson, puzzleToJson } from '../src/codec';
import { cellEnd, createPuzzle, edgeBetween, modeOf, portEnd, portId, puzzlesEqual } from '../src/model';

function sample() {
  const p = createPuzzle(7, 5);
  p.blocked.add(3).add(17).add(34);
  p.walls.add(edgeBetween(p, 0, 1)).add(edgeBetween(p, 8, 15)).add(edgeBetween(p, 26, 27));
  p.givens.add(edgeBetween(p, 10, 11));
  p.endpoints = [portEnd(portId(p, 'bottom', 4)), cellEnd(30)];
  return p;
}

describe('codec', () => {
  test('share code round-trips', () => {
    const p = sample();
    const q = decodePuzzle(encodePuzzle(p));
    expect(puzzlesEqual(p, q)).toBe(true);
    expect(q.endpoints).toEqual(p.endpoints);
  });

  test('cycle mode and large grids round-trip', () => {
    const p = createPuzzle(30, 30);
    p.blocked.add(899);
    p.walls.add(0);
    expect(puzzlesEqual(p, decodePuzzle(encodePuzzle(p)))).toBe(true);
  });

  test('share code is URL safe', () => {
    expect(encodePuzzle(sample())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('format 0.1 codes still open with tile ends', () => {
    // 3x3 path in format 0.1 with ends at tile 0 and tile 4.
    const bytes = [1, 2 << 1, 3, 3, 0, 0, 0, 4, 0, 0, 0, 0, 0];
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const q = decodePuzzle(code);
    expect(modeOf(q)).toBe('path');
    expect(q.endpoints).toEqual([cellEnd(0), cellEnd(4)]);
  });

  test('a legacy "path" with no ends opens as a loop', () => {
    // Format 0.2 header: path flag (bit 0 clear) but no ends.
    const bytes = [2, 0, 2, 2, 0, 0];
    expect(modeOf(decodePuzzle(btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')))).toBe('cycle');
    const j = { ...puzzleToJson(createPuzzle(3, 3)), mode: 'path', endpoints: [] };
    expect(modeOf(puzzleFromJson(j))).toBe('cycle');
  });

  test('JSON carries a 0.x format version', () => {
    expect(puzzleToJson(sample()).version).toBe('0.3');
  });

  test('format 0.2 codes and JSON open with frame ends', () => {
    const bytes = [2, 1 << 1, 3, 3, 0, 5, 0, 0, 0, 0, 0];
    const q = decodePuzzle(btoa(String.fromCharCode(...bytes)).replace(/=+$/, ''));
    expect(q.endpoints).toEqual([portEnd(5)]);
    const j = { ...puzzleToJson(createPuzzle(3, 3)), version: '0.2', endpoints: [2, 7] };
    expect(puzzleFromJson(j).endpoints).toEqual([portEnd(2), portEnd(7)]);
  });

  test('rejects garbage', () => {
    expect(() => decodePuzzle('!!')).toThrow();
    expect(() => decodePuzzle('AQ')).toThrow();
  });

  test('JSON round-trips through text', () => {
    const p = sample();
    const q = puzzleFromJson(JSON.parse(JSON.stringify(puzzleToJson(p))));
    expect(puzzlesEqual(p, q)).toBe(true);
  });

  test('JSON import validates indices', () => {
    const j = puzzleToJson(sample());
    expect(() => puzzleFromJson({ ...j, blocked: [999] })).toThrow();
    expect(() => puzzleFromJson({ ...j, width: 0 })).toThrow();
  });
});
