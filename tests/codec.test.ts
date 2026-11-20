import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle, puzzleFromJson, puzzleToJson } from '../src/codec';
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

  test('a one-shot keeps its flag through the share code and JSON; other codes are unchanged', () => {
    const p = sample();
    const plain = encodePuzzle(p);
    p.oneShot = true;
    const code = encodePuzzle(p);
    expect(code).not.toBe(plain);
    expect(decodePuzzle(code).oneShot).toBe(true);
    expect(decodePuzzle(plain).oneShot).toBeUndefined();
    expect(puzzlesEqual(p, decodePuzzle(code))).toBe(true);
    expect(puzzleFromJson(JSON.parse(JSON.stringify(puzzleToJson(p)))).oneShot).toBe(true);
    // Without both ends it isn't a one-shot, and the code doesn't say so.
    p.endpoints = p.endpoints.slice(0, 1);
    expect(encodePuzzle(p)).toBe(encodePuzzle({ ...p, oneShot: undefined }));
  });

  test('puzzles without ends and large grids round-trip', () => {
    const p = createPuzzle(30, 30);
    p.blocked.add(899);
    p.walls.add(0);
    expect(puzzlesEqual(p, decodePuzzle(encodePuzzle(p)))).toBe(true);
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

  test('JSON carries a 0.x format version', () => {
    expect(puzzleToJson(sample()).version).toBe('0.6');
  });

  test('codes in older formats (0.1–0.5) are refused', () => {
    // A hard 10×10 as a 0.5 code.
    expect(() => decodePuzzle('BQQKCgAEAAwAAAAAkAiAAAAgCAAAIAABCEAAAAAAAIAAAAJAAAABAkAAEA')).toThrow(/0\.5/);
  });

  test('JSON with no ends opens without ends, and bad ends are refused', () => {
    const j = puzzleToJson(createPuzzle(3, 3));
    expect(puzzleFromJson({ ...j, endpoints: [] }).endpoints).toEqual([]);
    expect(puzzleFromJson({ ...j, endpoints: undefined }).endpoints).toEqual([]);
    expect(() => puzzleFromJson({ ...j, endpoints: [{ port: 999 }] })).toThrow();
    expect(() => puzzleFromJson({ ...j, endpoints: [{ cell: 0 }] })).toThrow();
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
