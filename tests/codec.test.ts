import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle, puzzleFromJson, puzzleToJson, upgradeCode } from '../src/codec';
import { createPuzzle, edgeBetween, portEnd, portId, puzzlesEqual } from '../src/model';

function sample() {
  const p = createPuzzle(7, 5);
  p.blocked.add(3).add(17).add(34);
  p.walls.add(edgeBetween(p, 0, 1)).add(edgeBetween(p, 8, 15)).add(edgeBetween(p, 26, 27));
  p.endpoints = [portEnd(portId(p, 'bottom', 4)), portEnd(portId(p, 'top', 3))];
  return p;
}

describe('codec', () => {
  test('share code round-trips', () => {
    const p = sample();
    const q = decodePuzzle(encodePuzzle(p));
    expect(puzzlesEqual(p, q)).toBe(true);
    expect(q.endpoints).toEqual(p.endpoints);
  });

  test('checkpoints round-trip through codes and JSON', () => {
    const p = createPuzzle(30, 30);
    p.checkpoints = [899, 0, 450, 31];
    const q = decodePuzzle(encodePuzzle(p));
    expect(q.checkpoints).toEqual([899, 0, 450, 31]);
    expect(q.endpoints.length + q.checkpoints.length).toBeGreaterThan(0);
    expect(puzzleFromJson(JSON.parse(JSON.stringify(puzzleToJson(p)))).checkpoints).toEqual([899, 0, 450, 31]);
  });

  test('puzzles without ends and large grids round-trip', () => {
    const p = createPuzzle(30, 30);
    p.blocked.add(899);
    p.walls.add(0);
    expect(puzzlesEqual(p, decodePuzzle(encodePuzzle(p)))).toBe(true);
  });

  test('share code is URL safe', () => {
    expect(encodePuzzle(sample())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('format 0.1 tile ends open as checkpoints', () => {
    // 3x3 path in format 0.1 with ends at tile 0 and tile 4.
    const bytes = [1, 2 << 1, 3, 3, 0, 0, 0, 4, 0, 0, 0, 0, 0];
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const q = decodePuzzle(code);
    expect(q.endpoints.length + q.checkpoints.length).toBeGreaterThan(0);
    expect(q.endpoints).toEqual([]);
    expect(q.checkpoints).toEqual([0, 4]);
  });

  test('a code or file without the loop flag and without ends opens without ends', () => {
    // Format 0.2 header: path flag (bit 0 clear) but no ends.
    const bytes = [2, 0, 2, 2, 0, 0];
    expect(decodePuzzle(btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')).endpoints).toEqual([]);
    const j = { ...puzzleToJson(createPuzzle(3, 3)), mode: 'path', endpoints: [] };
    expect(puzzleFromJson(j).endpoints).toEqual([]);
  });

  test('a loop code opens with two ends side by side, low on the right', () => {
    // Format 0.5 loop, 4x4: the bottom-right tile and the one above it are black.
    const p = createPuzzle(4, 4);
    p.blocked.add(15).add(11);
    const bits = new Uint8Array(Math.ceil((16 + 24) / 8));
    for (const c of p.blocked) bits[c >> 3] |= 1 << (c & 7);
    const code = btoa(String.fromCharCode(5, 1, 4, 4, ...bits)).replace(/=+$/, '');
    const q = decodePuzzle(code);
    expect(q.endpoints).toEqual([portEnd(portId(q, 'right', 0)), portEnd(portId(q, 'right', 1))]);
    expect(upgradeCode(code)).toBe(encodePuzzle(q));
    expect(upgradeCode(encodePuzzle(q))).toBe(encodePuzzle(q));
    const j = { ...puzzleToJson(p), mode: 'cycle', endpoints: [] };
    expect(puzzleFromJson(j).endpoints).toEqual(q.endpoints);
  });

  test('givens in older codes and JSON are ignored', () => {
    // Format 0.4, 2x2 loop: blocked (4 bits) + walls (2+2 bits) + givens (4 bits) = 12 bits.
    const bytes = [4, 1, 2, 2, 0b11110000, 0b00001111];
    const q = decodePuzzle(btoa(String.fromCharCode(...bytes)).replace(/=+$/, ''));
    expect('givens' in q).toBe(false);
    expect(q.blocked.size).toBe(0);
    expect(q.walls.size).toBe(4);
    const j = { ...puzzleToJson(createPuzzle(3, 3)), version: '0.4', givens: [0, 1] };
    expect('givens' in puzzleFromJson(j)).toBe(false);
  });

  test('format 0.3 JSON: tile ends become checkpoints, or are dropped next to frame ends', () => {
    const base = { ...puzzleToJson(createPuzzle(3, 3)), version: '0.3' };
    const a = puzzleFromJson({ ...base, endpoints: [{ cell: 0 }, { cell: 8 }] });
    expect(a.checkpoints).toEqual([0, 8]);
    expect(a.endpoints).toEqual([]);
    const b = puzzleFromJson({ ...base, endpoints: [{ port: 2 }, { cell: 8 }] });
    expect(b.endpoints).toEqual([portEnd(2)]);
    expect(b.checkpoints).toEqual([]);
  });

  test('JSON carries a 0.x format version', () => {
    expect(puzzleToJson(sample()).version).toBe('0.5');
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
