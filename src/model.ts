/**
 * Core puzzle data model.
 *
 * Cells are indexed `r * w + c`.
 * Edges (borders between orthogonally adjacent cells) are indexed so that a
 * single numeric key space is shared by walls, givens, player segments and
 * X marks:
 *   - horizontal edges join (r, c) and (r, c + 1): id = r * (w - 1) + c,
 *     for 0 <= id < h * (w - 1)
 *   - vertical edges join (r, c) and (r + 1, c): id = h * (w - 1) + r * w + c
 */

export type Mode = 'path' | 'cycle';

export interface Puzzle {
  mode: Mode;
  w: number;
  h: number;
  /** Black tiles the path does not visit. */
  blocked: Set<number>;
  /** Black edges the path may not cross. */
  walls: Set<number>;
  /** Path mode only: up to two cells where the path must end. */
  endpoints: number[];
  /** Segments that are part of the solution and given to the player. */
  givens: Set<number>;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SIZE = 1;
export const MAX_SIZE = 30;

export function createPuzzle(w: number, h: number, mode: Mode = 'path'): Puzzle {
  return { mode, w, h, blocked: new Set(), walls: new Set(), endpoints: [], givens: new Set() };
}

export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    mode: p.mode,
    w: p.w,
    h: p.h,
    blocked: new Set(p.blocked),
    walls: new Set(p.walls),
    endpoints: [...p.endpoints],
    givens: new Set(p.givens),
  };
}

export function cellCount({ w, h }: Size): number {
  return w * h;
}

export function horizontalEdgeCount({ w, h }: Size): number {
  return h * (w - 1);
}

export function edgeCount(s: Size): number {
  return horizontalEdgeCount(s) + (s.h - 1) * s.w;
}

export function cellAt({ w }: Size, r: number, c: number): number {
  return r * w + c;
}

export function cellRC({ w }: Size, cell: number): [number, number] {
  return [Math.floor(cell / w), cell % w];
}

/** The two cells an edge joins, lower index first. */
export function edgeCells(s: Size, e: number): [number, number] {
  const hc = horizontalEdgeCount(s);
  if (e < hc) {
    const r = Math.floor(e / (s.w - 1));
    const c = e % (s.w - 1);
    const a = r * s.w + c;
    return [a, a + 1];
  }
  const v = e - hc;
  return [v, v + s.w];
}

export function isHorizontalEdge(s: Size, e: number): boolean {
  return e < horizontalEdgeCount(s);
}

/** Edge joining two cells, or -1 if they are not orthogonally adjacent. */
export function edgeBetween(s: Size, a: number, b: number): number {
  if (a > b) [a, b] = [b, a];
  const [ra, ca] = cellRC(s, a);
  const [rb, cb] = cellRC(s, b);
  if (ra === rb && cb === ca + 1) return ra * (s.w - 1) + ca;
  if (ca === cb && rb === ra + 1) return horizontalEdgeCount(s) + a;
  return -1;
}

export function neighbors(s: Size, cell: number): number[] {
  const [r, c] = cellRC(s, cell);
  const out: number[] = [];
  if (r > 0) out.push(cell - s.w);
  if (c > 0) out.push(cell - 1);
  if (c < s.w - 1) out.push(cell + 1);
  if (r < s.h - 1) out.push(cell + s.w);
  return out;
}

/** Edges incident to a cell. */
export function cellEdges(s: Size, cell: number): number[] {
  return neighbors(s, cell).map((n) => edgeBetween(s, cell, n));
}

export function isOpen(p: Puzzle, cell: number): boolean {
  return !p.blocked.has(cell);
}

export function openCells(p: Puzzle): number[] {
  const out: number[] = [];
  for (let i = 0; i < cellCount(p); i++) if (!p.blocked.has(i)) out.push(i);
  return out;
}

/** Whether the path may use this edge at all (both tiles open, no wall). */
export function isUsableEdge(p: Puzzle, e: number): boolean {
  if (p.walls.has(e)) return false;
  const [a, b] = edgeCells(p, e);
  return !p.blocked.has(a) && !p.blocked.has(b);
}

/**
 * Resize a puzzle, keeping features whose cells still exist.
 * The grid is anchored at the top-left corner.
 */
export function resizePuzzle(p: Puzzle, w: number, h: number): Puzzle {
  const out = createPuzzle(w, h, p.mode);
  const mapCell = (cell: number): number => {
    const [r, c] = cellRC(p, cell);
    return r < h && c < w ? r * w + c : -1;
  };
  const mapEdge = (e: number): number => {
    const [a, b] = edgeCells(p, e);
    const na = mapCell(a);
    const nb = mapCell(b);
    return na < 0 || nb < 0 ? -1 : edgeBetween(out, na, nb);
  };
  for (const cell of p.blocked) {
    const n = mapCell(cell);
    if (n >= 0) out.blocked.add(n);
  }
  for (const e of p.walls) {
    const n = mapEdge(e);
    if (n >= 0) out.walls.add(n);
  }
  for (const e of p.givens) {
    const n = mapEdge(e);
    if (n >= 0) out.givens.add(n);
  }
  out.endpoints = p.endpoints.map(mapCell).filter((c) => c >= 0);
  return out;
}

export function puzzlesEqual(a: Puzzle, b: Puzzle): boolean {
  const setEq = (x: Set<number>, y: Set<number>) => x.size === y.size && [...x].every((v) => y.has(v));
  return (
    a.mode === b.mode &&
    a.w === b.w &&
    a.h === b.h &&
    setEq(a.blocked, b.blocked) &&
    setEq(a.walls, b.walls) &&
    setEq(a.givens, b.givens) &&
    setEq(new Set(a.endpoints), new Set(b.endpoints))
  );
}
