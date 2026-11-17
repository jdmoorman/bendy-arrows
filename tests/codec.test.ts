import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle, puzzleFromJson, puzzleToJson } from '../src/codec';
import { createPuzzle, edgeBetween, puzzlesEqual } from '../src/model';

function sample() {
  const p = createPuzzle(7, 5, 'path');
  p.blocked.add(3).add(17).add(34);
  p.walls.add(edgeBetween(p, 0, 1)).add(edgeBetween(p, 8, 15)).add(edgeBetween(p, 26, 27));
  p.givens.add(edgeBetween(p, 10, 11));
  p.endpoints = [0, 300 % 35];
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
    const p = createPuzzle(30, 30, 'cycle');
    p.blocked.add(899);
    p.walls.add(0);
    expect(puzzlesEqual(p, decodePuzzle(encodePuzzle(p)))).toBe(true);
  });

  test('share code is URL safe', () => {
    expect(encodePuzzle(sample())).toMatch(/^[A-Za-z0-9_-]+$/);
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
