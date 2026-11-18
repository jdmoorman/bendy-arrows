import { createPuzzle, edgeBetween, portEnd, portId, type Puzzle, type Size } from '../src/model';

/** Segments joining consecutive cells, given as [r, c] pairs. */
export function pathEdges(s: Size, cells: [number, number][], close = false): Set<number> {
  const ids = cells.map(([r, c]) => r * s.w + c);
  if (close) ids.push(ids[0]);
  const out = new Set<number>();
  for (let i = 1; i < ids.length; i++) {
    const e = edgeBetween(s, ids[i - 1], ids[i]);
    if (e < 0) throw new Error(`cells ${ids[i - 1]} and ${ids[i]} are not adjacent`);
    out.add(e);
  }
  return out;
}

/** An open board with its two ends side by side at the bottom of the right side. */
export function endsBottomRight(w: number, h: number): Puzzle {
  const p = createPuzzle(w, h);
  p.endpoints = [portEnd(portId(p, 'right', h - 2)), portEnd(portId(p, 'right', h - 1))];
  return p;
}
