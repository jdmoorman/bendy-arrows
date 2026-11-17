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
 *
 * Ports are the borders on the outside frame, numbered clockwise in groups:
 *   top    (0, c) .......... port = c
 *   right  (r, w - 1) ...... port = w + r
 *   bottom (h - 1, c) ...... port = w + h + c
 *   left   (r, 0) .......... port = 2w + h + r
 */

export type Mode = 'path' | 'cycle';

export interface Puzzle {
  w: number;
  h: number;
  /** Black tiles the path does not visit. */
  blocked: Set<number>;
  /** Black edges the path may not cross. */
  walls: Set<number>;
  /**
   * Up to two ends, each either a tile where the path must start/stop or a
   * port (outer border of the frame, see portCell) where it enters or leaves.
   * The first is the entrance. A puzzle with ends is a path puzzle; with none
   * it is a loop (see modeOf).
   */
  endpoints: End[];
  /** Segments that are part of the solution and given to the player. */
  givens: Set<number>;
}

/** A fixed end of the path: a tile, or a border segment on the outer frame. */
export type End = { kind: 'cell'; cell: number } | { kind: 'port'; port: number };

export function cellEnd(cell: number): End {
  return { kind: 'cell', cell };
}

export function portEnd(port: number): End {
  return { kind: 'port', port };
}

export function endsEqual(a: End, b: End): boolean {
  return a.kind === 'cell' ? b.kind === 'cell' && a.cell === b.cell : b.kind === 'port' && a.port === b.port;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SIZE = 1;
export const MAX_SIZE = 30;

/** Path puzzles have ends; a puzzle without ends is a loop. */
export function modeOf(p: Puzzle): Mode {
  return p.endpoints.length > 0 ? 'path' : 'cycle';
}

export function createPuzzle(w: number, h: number): Puzzle {
  return { w, h, blocked: new Set(), walls: new Set(), endpoints: [], givens: new Set() };
}

export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    w: p.w,
    h: p.h,
    blocked: new Set(p.blocked),
    walls: new Set(p.walls),
    endpoints: p.endpoints.map((e) => ({ ...e })),
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

export type Side = 'top' | 'right' | 'bottom' | 'left';

export function portCount({ w, h }: Size): number {
  return 2 * (w + h);
}

export function portId({ w, h }: Size, side: Side, i: number): number {
  switch (side) {
    case 'top':
      return i;
    case 'right':
      return w + i;
    case 'bottom':
      return w + h + i;
    case 'left':
      return 2 * w + h + i;
  }
}

/** Side of the frame a port is on, and its column (top/bottom) or row (left/right). */
export function portSide({ w, h }: Size, port: number): [Side, number] {
  if (port < w) return ['top', port];
  if (port < w + h) return ['right', port - w];
  if (port < 2 * w + h) return ['bottom', port - w - h];
  return ['left', port - 2 * w - h];
}

/** The tile just inside a port. */
export function portCell(s: Size, port: number): number {
  const [side, i] = portSide(s, port);
  switch (side) {
    case 'top':
      return i;
    case 'right':
      return i * s.w + s.w - 1;
    case 'bottom':
      return (s.h - 1) * s.w + i;
    case 'left':
      return i * s.w;
  }
}

/** The tile an end belongs to. */
export function endTile(s: Size, end: End): number {
  return end.kind === 'cell' ? end.cell : portCell(s, end.port);
}

/** Tiles where the path must end (path mode). */
export function endpointCells(p: Puzzle): number[] {
  return p.endpoints.slice(0, 2).map((e) => endTile(p, e));
}

export function isOpen(p: Puzzle, cell: number): boolean {
  return !p.blocked.has(cell);
}

export function openCells(p: Puzzle): number[] {
  const out: number[] = [];
  for (let i = 0; i < cellCount(p); i++) if (!p.blocked.has(i)) out.push(i);
  return out;
}

/** Whether either tile beside this edge is black. */
export function edgeTouchesBlocked(p: Puzzle, e: number): boolean {
  const [a, b] = edgeCells(p, e);
  return p.blocked.has(a) || p.blocked.has(b);
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
  const out = createPuzzle(w, h);
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
  // Tile ends keep their tile; ports stay on the same side of the frame.
  out.endpoints = [];
  for (const end of p.endpoints) {
    if (end.kind === 'cell') {
      const c = mapCell(end.cell);
      if (c >= 0) out.endpoints.push(cellEnd(c));
    } else {
      const [side, i] = portSide(p, end.port);
      const limit = side === 'top' || side === 'bottom' ? w : h;
      if (i < limit) out.endpoints.push(portEnd(portId(out, side, i)));
    }
  }
  return out;
}

export function puzzlesEqual(a: Puzzle, b: Puzzle): boolean {
  const setEq = (x: Set<number>, y: Set<number>) => x.size === y.size && [...x].every((v) => y.has(v));
  return (
    a.w === b.w &&
    a.h === b.h &&
    setEq(a.blocked, b.blocked) &&
    setEq(a.walls, b.walls) &&
    setEq(a.givens, b.givens) &&
    a.endpoints.length === b.endpoints.length &&
    a.endpoints.every((v, i) => endsEqual(v, b.endpoints[i]))
  );
}
