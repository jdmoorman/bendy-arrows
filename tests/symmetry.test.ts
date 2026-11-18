import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, portEnd, portId } from '../src/model';
import { symmetryOf } from '../src/symmetry';

describe('symmetry', () => {
  test('an empty board is symmetric; a lone off-centre wall breaks it', () => {
    const p = createPuzzle(4, 3);
    expect(symmetryOf(p)).not.toBeNull();
    p.walls.add(edgeBetween(p, 0, 1));
    expect(symmetryOf(p)).toBeNull();
  });
  test('ends match by their tiles, whichever side they enter from', () => {
    const p = createPuzzle(4, 4);
    // Both ends in corners on the main diagonal, one entering from the top, one from the right.
    p.endpoints = [portEnd(portId(p, 'top', 0)), portEnd(portId(p, 'right', 3))];
    expect(symmetryOf(p)).not.toBeNull();
  });

  test('ends count, in either order', () => {
    const p = createPuzzle(4, 3);
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 0))];
    expect(symmetryOf(p)).toBe('mirrored left–right');
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 2))];
    expect(symmetryOf(p)).toBe('the same after a half turn');
  });
});
