import { describe, expect, test } from 'vitest';
import { hitTest, stepToward } from '../src/input';
import { createPuzzle, edgeBetween } from '../src/model';
import { History } from '../src/history';

describe('hitTest', () => {
  const p = createPuzzle(3, 3);
  test('centre of a tile hits the tile only', () => {
    expect(hitTest(p, 1.5, 1.5)).toEqual({ cell: 4, edge: -1, edgeDist: Infinity });
  });
  test('near a border hits that border', () => {
    expect(hitTest(p, 1.95, 1.5)!.edge).toBe(edgeBetween(p, 4, 5));
    expect(hitTest(p, 1.5, 0.97)!.edge).toBe(edgeBetween(p, 1, 4));
  });
  test('outer borders are ignored', () => {
    expect(hitTest(p, 0.02, 0.5)!.edge).toBe(-1);
    expect(hitTest(p, 0.02, 0.5, Infinity)!.edge).toBe(edgeBetween(p, 0, 3));
  });
  test('outside the grid is null', () => {
    expect(hitTest(p, -0.1, 1)).toBeNull();
    expect(hitTest(p, 3, 1)).toBeNull();
  });
});

describe('stepToward', () => {
  const p = createPuzzle(4, 4);
  test('moves along the longer axis first', () => {
    expect(stepToward(p, 0, 7)).toBe(1); // (0,0)->(1,3)
    expect(stepToward(p, 0, 12)).toBe(4); // straight down
  });
});

describe('History', () => {
  test('undo/redo', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeUndefined();
    expect(h.redo(1)).toBe(2);
    h.push(5);
    expect(h.canRedo).toBe(false);
  });
});

describe('wall strokes follow the grid corners', async () => {
  const { continueWallStroke } = await import('../src/input');
  const p = createPuzzle(6, 6);
  /** Borders on the line y = row (between rows row-1 and row), from column x. */
  const hBorder = (row: number, x: number) => edgeBetween(p, (row - 1) * 6 + x, row * 6 + x);
  /** Borders on the line x = col (between columns col-1 and col), in row y. */
  const vBorder = (col: number, y: number) => edgeBetween(p, y * 6 + col - 1, y * 6 + col);
  /** Paint along pointer points (tile units), starting on the border under the first. */
  const stroke = (points: [number, number][]) => {
    const [x0, y0] = points[0];
    const first = hitTest(p, x0, y0, Infinity)!.edge;
    const s = { first, corner: null as [number, number] | null };
    const painted = [first];
    for (const [x, y] of points.slice(1)) for (const e of continueWallStroke(p, s, x, y)) if (painted.at(-1) !== e) painted.push(e);
    return painted;
  };
  /** Points from a to b, with an optional sideways wobble. */
  const line = (a: [number, number], b: [number, number], wobble = 0, n = 40): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const w = wobble * Math.sin(i * 1.7);
      const horizontal = a[1] === b[1];
      return [a[0] + (b[0] - a[0]) * t + (horizontal ? 0 : w), a[1] + (b[1] - a[1]) * t + (horizontal ? w : 0)];
    });

  test('a wobbly straight stroke stays straight: no stubs where it brushes crossing borders', () => {
    const painted = stroke(line([0.5, 3.05], [5.5, 3.05], 0.22));
    expect(new Set(painted)).toEqual(new Set([0, 1, 2, 3, 4, 5].map((x) => hBorder(3, x))));
  });
  test('it turns when the pointer clearly heads along another line', () => {
    const painted = stroke([...line([0.5, 3], [2, 3]), ...line([2, 3], [2, 5.6])]);
    expect(new Set(painted)).toEqual(new Set([hBorder(3, 0), hBorder(3, 1), vBorder(2, 3), vBorder(2, 4), vBorder(2, 5)]));
  });
  test('a fast flick still paints every border it crosses', () => {
    expect(stroke([[0.5, 3], [4.6, 3]])).toEqual([0, 1, 2, 3, 4].map((x) => hBorder(3, x)));
  });
  test('doubling back over the stroke lets it branch from there', () => {
    const painted = stroke([...line([0.5, 3], [3.6, 3]), ...line([3.6, 3], [1, 3]), ...line([1, 3], [1, 0.4])]);
    expect(new Set(painted)).toEqual(new Set([0, 1, 2, 3].map((x) => hBorder(3, x)).concat([2, 1, 0].map((y) => vBorder(1, y)))));
  });
});

describe('ending a wall stroke', async () => {
  const { continueWallStroke, STROKE_END_STEP } = await import('../src/input');
  const p = createPuzzle(6, 6);
  test('a stroke that stops a little short of the last border\'s middle still takes it on release', () => {
    const first = edgeBetween(p, 2 * 6, 3 * 6); // the border under (0.5, 3)
    const s = { first, corner: null as [number, number] | null };
    const during = [0.9, 1.5, 2.5, 3.5, 4.5, 5.4].flatMap((x) => continueWallStroke(p, s, x, 3));
    expect(during).not.toContain(edgeBetween(p, 2 * 6 + 5, 3 * 6 + 5));
    expect(continueWallStroke(p, s, 5.4, 3, STROKE_END_STEP, 1)).toEqual([edgeBetween(p, 2 * 6 + 5, 3 * 6 + 5)]);
  });
});
