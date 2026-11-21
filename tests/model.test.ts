import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween, edgeCells, edgeCount, neighbors, portCell, portCount, portEnd, portId, portSide, resizePuzzle, type Puzzle, type Side } from '../src/model';

describe('model', () => {
  test('edge ids round-trip through edgeCells/edgeBetween', () => {
    const s = { w: 4, h: 3 };
    expect(edgeCount(s)).toBe(3 * 3 + 2 * 4);
    for (let e = 0; e < edgeCount(s); e++) {
      const [a, b] = edgeCells(s, e);
      expect(edgeBetween(s, a, b)).toBe(e);
      expect(edgeBetween(s, b, a)).toBe(e);
    }
  });

  test('non-adjacent cells have no edge', () => {
    const s = { w: 3, h: 3 };
    expect(edgeBetween(s, 2, 3)).toBe(-1); // wraps a row
    expect(edgeBetween(s, 0, 4)).toBe(-1); // diagonal
  });

  test('neighbors respect borders', () => {
    const s = { w: 3, h: 2 };
    expect(neighbors(s, 0).sort()).toEqual([1, 3]);
    expect(neighbors(s, 4).sort()).toEqual([1, 3, 5]);
  });

  test('resize keeps features inside the new bounds', () => {
    const p = createPuzzle(3, 3);
    p.blocked.add(8); // (2,2)
    p.blocked.add(4); // (1,1)
    p.walls.add(edgeBetween(p, 0, 1));
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'right', 2))];
    const q = resizePuzzle(p, 2, 2);
    expect([...q.blocked]).toEqual([3]);
    expect([...q.walls]).toEqual([edgeBetween(q, 0, 1)]);
    expect(q.endpoints).toEqual([portEnd(portId(q, 'left', 0))]);
  });

  test('ports cover the frame clockwise and map to edge tiles', () => {
    const s = { w: 3, h: 2 };
    expect(portCount(s)).toBe(10);
    const cells = Array.from({ length: 10 }, (_, i) => portCell(s, i));
    expect(cells).toEqual([0, 1, 2, 2, 5, 3, 4, 5, 0, 3]);
    for (let i = 0; i < 10; i++) {
      const [side, k] = portSide(s, i);
      expect(portId(s, side, k)).toBe(i);
    }
  });
});

describe('transformPuzzle', async () => {
  const { transformPuzzle } = await import('../src/model');
  const { decodePuzzle } = await import('../src/codec');
  const { SAMPLES } = await import('./samples');
  const { solve } = await import('../src/solver');
  const { portEnd, portId, puzzlesEqual } = await import('../src/model');

  const sample = () => {
    const p = createPuzzle(4, 3);
    p.blocked.add(5);
    p.walls.add(edgeBetween(p, 0, 1)).add(edgeBetween(p, 6, 10));
    p.endpoints = [portEnd(portId(p, 'left', 0)), portEnd(portId(p, 'bottom', 3))];
    return p;
  };

  test('four quarter turns, or two flips, give back the same puzzle', () => {
    const p = sample();
    let q = p;
    for (let i = 0; i < 4; i++) q = transformPuzzle(q, 'rotateRight');
    expect(puzzlesEqual(p, q)).toBe(true);
    expect(puzzlesEqual(p, transformPuzzle(transformPuzzle(p, 'rotateLeft'), 'rotateRight'))).toBe(true);
    expect(puzzlesEqual(p, transformPuzzle(transformPuzzle(p, 'flipH'), 'flipH'))).toBe(true);
    expect(puzzlesEqual(p, transformPuzzle(transformPuzzle(p, 'flipV'), 'flipV'))).toBe(true);
  });

  test('rotating right moves the left frame end to the top', () => {
    const q = transformPuzzle(sample(), 'rotateRight');
    expect([q.w, q.h]).toEqual([3, 4]);
    expect(q.endpoints[0]).toEqual(portEnd(portId(q, 'top', 2)));
    expect(q.blocked.has(1 * 3 + 1)).toBe(true); // (1,1) -> (1, 1)
  });

  test('transforms keep the number of solutions', () => {
    // A few small samples of each kind; the big ones only add solving time.
    const small = SAMPLES.filter((s) => !s.group && decodePuzzle(s.code).w * decodePuzzle(s.code).h <= 36);
    for (const s of small) {
      const p = decodePuzzle(s.code);
      for (const t of ['rotateLeft', 'rotateRight', 'flipH', 'flipV'] as const) {
        expect(solve(transformPuzzle(p, t)).status).toBe('unique');
      }
    }
    const c = createPuzzle(4, 4);
    c.endpoints = [portEnd(portId(c, 'top', 0)), portEnd(portId(c, 'bottom', 3))];
    const n = solve(c, { maxSolutions: 1e9 }).solutions.length;
    for (const t of ['rotateLeft', 'rotateRight', 'flipH', 'flipV'] as const) {
      expect(solve(transformPuzzle(c, t), { maxSolutions: 1e9 }).solutions.length).toBe(n);
    }
  });
});

describe('orientTail', async () => {
  const modelModule = await import('../src/model');
  const { orientTail, tailLeftLow } = modelModule;
  test('a square level ends up with its tail low on the left, its head as low and far right as can be', () => {
    for (const side of ['top', 'right', 'bottom', 'left'] as Side[]) {
      for (let i = 0; i < 5; i++) {
        const p = createPuzzle(5, 5);
        p.endpoints = [portEnd(portId(p, side, i)), portEnd(portId(p, side === 'top' ? 'bottom' : 'top', 2))];
        p.blocked.add(6);
        const q = orientTail(p);
        const [s, row] = portSide(q, q.endpoints[0].port);
        expect([s, row >= 2], `${side} ${i}`).toEqual(['left', true]);
        expect(tailLeftLow(q)).toBe(true);
        expect(q.blocked.size).toBe(1);
      }
    }
  });
  test('levels that already fit are left alone', () => {
    const p = createPuzzle(4, 4);
    p.endpoints = [portEnd(portId(p, 'left', 2)), portEnd(portId(p, 'right', 1))];
    expect(orientTail(p)).toBe(p);
    const tall = createPuzzle(4, 6);
    tall.endpoints = [portEnd(portId(tall, 'left', 4)), portEnd(portId(tall, 'right', 1))];
    expect(orientTail(tall)).toBe(tall);
  });
  test('a tall level is only mirrored or turned half round: tail on the left edge if it can be, then low', () => {
    const p = createPuzzle(4, 6);
    p.endpoints = [portEnd(portId(p, 'right', 1)), portEnd(portId(p, 'top', 2))];
    const q = orientTail(p);
    expect([q.w, q.h, ...portSide(q, q.endpoints[0].port)]).toEqual([4, 6, 'left', 4]);
  });
  test('an arrow on a corner tile moves round its corner: opposite the other end, or else beside it', () => {
    const { cornerEnds } = modelModule;
    // Tail in the top-right corner coming in from the top, head on the left: the tail moves
    // to the corner's right side (opposite the head), then the level is mirrored.
    const top = createPuzzle(4, 6);
    top.endpoints = [portEnd(portId(top, 'top', 3)), portEnd(portId(top, 'left', 2))];
    expect(portSide(top, cornerEnds(top).endpoints[0].port)).toEqual(['right', 0]);
    const t = orientTail(top);
    expect([t.w, t.h, ...portSide(t, t.endpoints[0].port), portSide(t, t.endpoints[1].port)[0]]).toEqual([4, 6, 'left', 5, 'right']);
    // Head on the top edge (not a corner), tail in the bottom-left corner from the left: the
    // tail moves to the bottom, opposite the head.
    const q = createPuzzle(4, 6);
    q.endpoints = [portEnd(portId(q, 'left', 5)), portEnd(portId(q, 'top', 1))];
    expect(portSide(q, cornerEnds(q).endpoints[0].port)).toEqual(['bottom', 0]);
    // Can't be opposite: the same side instead (tail in the top-left corner from the top, head on the left).
    const same = createPuzzle(4, 6);
    same.endpoints = [portEnd(portId(same, 'top', 0)), portEnd(portId(same, 'left', 3))];
    expect(portSide(same, cornerEnds(same).endpoints[0].port)).toEqual(['left', 0]);
    // Already opposite: left alone.
    const fine = createPuzzle(4, 6);
    fine.endpoints = [portEnd(portId(fine, 'left', 0)), portEnd(portId(fine, 'right', 3))];
    expect(cornerEnds(fine)).toBe(fine);
  });
});

describe('orientEnds', async () => {
  const { orientEnds } = await import('../src/model');
  const end = portEnd;
  const pid = portId;
  const sides = (p: Puzzle) => p.endpoints.map((e) => portSide(p, e.port)[0]);
  const withEnds = (w: number, h: number, a: [Side, number], b: [Side, number]) => {
    const p = createPuzzle(w, h);
    p.endpoints = [end(pid(p, a[0], a[1])), end(pid(p, b[0], b[1]))];
    p.blocked.add(1);
    return p;
  };
  test('ends on opposite sides come in on the left and go out on the right', () => {
    for (const [a, b] of [['left', 'right'], ['right', 'left'], ['top', 'bottom'], ['bottom', 'top']] as [Side, Side][]) {
      const p = withEnds(5, 3, [a, 1], [b, 0]);
      const q = orientEnds(p);
      expect(sides(q)).toEqual(['left', 'right']);
      expect(q.blocked.size).toBe(1);
    }
  });
  test('keepSize never turns a non-square board, but does turn a square one', () => {
    const tall = orientEnds(withEnds(5, 3, ['bottom', 1], ['top', 0]), true);
    expect([tall.w, tall.h, ...sides(tall)]).toEqual([5, 3, 'top', 'bottom']);
    const sq = orientEnds(withEnds(4, 4, ['bottom', 1], ['top', 0]), true);
    expect(sides(sq)).toEqual(['left', 'right']);
  });
  test('other puzzles are left alone', () => {
    const corner = withEnds(4, 4, ['left', 0], ['top', 2]);
    expect(orientEnds(corner)).toBe(corner);
    const noEnds = createPuzzle(4, 4);
    expect(orientEnds(noEnds)).toBe(noEnds);
  });

});

describe('pathKey', async () => {
  const { pathKey, createPuzzle, edgeBetween, transformPuzzle } = await import('../src/model');
  const { solve } = await import('../src/solver');
  const { decodePuzzle } = await import('../src/codec');

  test('a path turned or mirrored has the same key; a different path does not', () => {
    const p = decodePuzzle('BjGrTR3joHI');
    const path = solve(p, { maxSolutions: 1 }).solutions[0];
    for (const t of ['rotateRight', 'rotateLeft', 'flipH', 'flipV'] as const) {
      const q = transformPuzzle(p, t);
      expect(pathKey(q, solve(q, { maxSolutions: 1 }).solutions[0])).toBe(pathKey(p, path));
    }
    // Two different paths through a 2×2 board's corner: an L and its other half.
    const b = createPuzzle(3, 2);
    const snake = [edgeBetween(b, 0, 1), edgeBetween(b, 1, 2), edgeBetween(b, 2, 5), edgeBetween(b, 5, 4), edgeBetween(b, 4, 3)];
    const other = [edgeBetween(b, 0, 3), edgeBetween(b, 3, 4), edgeBetween(b, 4, 1), edgeBetween(b, 1, 2), edgeBetween(b, 2, 5)];
    expect(pathKey(b, snake)).not.toBe(pathKey(b, other));
  });
});
