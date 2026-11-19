import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle, NumbersNotSupported, puzzleFromJson, puzzleToJson } from '../src/codec';
import { createPuzzle, edgeBetween, edgeCount, portCount, portEnd, portId, puzzlesEqual } from '../src/model';

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

  test('codes and files with numbers are refused', () => {
    // A 0.5 numbers puzzle, as the old Numbers samples were.
    expect(() => decodePuzzle('BQgGBgACAAcAFAAAAAAAIANAKICAAA')).toThrow(NumbersNotSupported);
    const j = { ...puzzleToJson(createPuzzle(3, 3)), checkpoints: [0, 8] };
    expect(() => puzzleFromJson(j)).toThrow(NumbersNotSupported);
  });

  test('puzzles without ends and large grids round-trip', () => {
    const p = createPuzzle(30, 30);
    p.blocked.add(899);
    p.walls.add(0);
    expect(puzzlesEqual(p, decodePuzzle(encodePuzzle(p)))).toBe(true);
  });

  test('0.5 codes still open, and re-encode to the shorter 0.6 form', () => {
    // Hard 10×10 with 17 obstacles, as a 0.5 code (a bitset of every tile and border).
    const old = 'BQQKCgAEAAwAAAAAkAiAAAAgCAAAIAABCEAAAAAAAIAAAAJAAAABAkAAEA';
    const p = decodePuzzle(old);
    expect(p.walls.size + p.blocked.size).toBe(17);
    const code = encodePuzzle(p);
    expect(code.length).toBeLessThan(old.length / 2);
    expect(puzzlesEqual(p, decodePuzzle(code))).toBe(true);
    expect(decodePuzzle(code).endpoints).toEqual(p.endpoints);
  });

  test('random puzzles of every shape round-trip', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 300; trial++) {
      const p = createPuzzle(1 + Math.floor(rand() * 30), 1 + Math.floor(rand() * 30));
      const density = rand() * rand();
      for (let c = 0; c < p.w * p.h; c++) if (rand() < density) p.blocked.add(c);
      for (let e = 0; e < edgeCount(p); e++) if (rand() < density) p.walls.add(e);
      const ends = Math.floor(rand() * 3);
      for (let i = 0; i < ends; i++) p.endpoints.push(portEnd(Math.floor(rand() * portCount(p))));
      const q = decodePuzzle(encodePuzzle(p));
      expect(puzzlesEqual(p, q), `trial ${trial}`).toBe(true);
      expect(q.endpoints, `trial ${trial}`).toEqual(p.endpoints);
    }
  });

  test('share code is URL safe', () => {
    expect(encodePuzzle(sample())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('format 0.1 tile ends (which opened as numbers) are refused', () => {
    // 3x3 path in format 0.1 with ends at tile 0 and tile 4.
    const bytes = [1, 2 << 1, 3, 3, 0, 0, 0, 4, 0, 0, 0, 0, 0];
    const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodePuzzle(code)).toThrow(NumbersNotSupported);
  });

  test('a code or file without the loop flag and without ends opens without ends', () => {
    // Format 0.2 header: path flag (bit 0 clear) but no ends.
    const bytes = [2, 0, 2, 2, 0, 0];
    expect(decodePuzzle(btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')).endpoints).toEqual([]);
    const j = { ...puzzleToJson(createPuzzle(3, 3)), mode: 'path', endpoints: [] };
    expect(puzzleFromJson(j).endpoints).toEqual([]);
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

  test('format 0.3 JSON: tile ends (numbers) are refused', () => {
    const base = { ...puzzleToJson(createPuzzle(3, 3)), version: '0.3' };
    expect(() => puzzleFromJson({ ...base, endpoints: [{ cell: 0 }, { cell: 8 }] })).toThrow(NumbersNotSupported);
  });

  test('JSON carries a 0.x format version', () => {
    expect(puzzleToJson(sample()).version).toBe('0.6');
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
