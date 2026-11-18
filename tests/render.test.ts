import { describe, expect, test } from 'vitest';
import { createPuzzle, edgeBetween } from '../src/model';
import { edgeRuns } from '../src/render';
import { pathEdges } from './helpers';

const edgesIn = (runs: { cells: number[]; closed: boolean }[], s: { w: number; h: number }) => {
  const out: number[] = [];
  for (const r of runs) {
    const cells = r.closed ? [...r.cells, r.cells[0]] : r.cells;
    for (let i = 1; i < cells.length; i++) out.push(edgeBetween(s, cells[i - 1], cells[i]));
  }
  return out.sort((a, b) => a - b);
};

describe('edgeRuns', () => {
  test('a snake is one open run', () => {
    const p = createPuzzle(3, 3);
    const edges = pathEdges(p, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2]]);
    const runs = edgeRuns(p, edges);
    expect(runs).toHaveLength(1);
    expect(runs[0].closed).toBe(false);
    expect(runs[0].cells).toHaveLength(9);
  });

  test('a loop is one closed run', () => {
    const p = createPuzzle(2, 2);
    const runs = edgeRuns(p, pathEdges(p, [[0, 0], [0, 1], [1, 1], [1, 0]], true));
    expect(runs).toEqual([{ cells: expect.any(Array), closed: true }]);
    expect(runs[0].cells).toHaveLength(4);
  });

  test('branches split into runs that use every edge exactly once', () => {
    const p = createPuzzle(3, 3);
    // A plus sign centred on tile 4, plus a loop hanging off it.
    const edges = new Set([1, 3, 5, 7].map((c) => edgeBetween(p, 4, c)));
    for (const e of pathEdges(p, [[0, 1], [0, 2], [1, 2]])) edges.add(e);
    const runs = edgeRuns(p, edges);
    expect(edgesIn(runs, p)).toEqual([...edges].sort((a, b) => a - b));
  });
});

describe('coordinates', async () => {
  const { columnName } = await import('../src/render');
  test('columns are letters from A, then AA, AB … past Z', () => {
    expect([0, 1, 25, 26, 27, 29].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AD']);
  });
});
