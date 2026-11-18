/**
 * Core puzzle data model.
 *
 * Cells are indexed `r * w + c`.
 * Edges (borders between orthogonally adjacent cells) are indexed so that a
 * single numeric key space is shared by walls, player segments and
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
   * The first is the entrance. (Loop puzzles, with no ends, are gone: see loopToEnds.)
   */
  endpoints: End[];
  /**
   * Numbered checkpoints (tiles), in order: checkpoints[0] is 1. The path
   * starts at 1, passes through each in order and ends at the last. Puzzles
   * use either checkpoints or ends, not both.
   */
  checkpoints: number[];
}

/**
 * A fixed end of the path: a border segment (port) on the outer frame.
 * (Ends inside the grid would just be checkpoints, so they are not allowed.)
 */
export type End = { kind: 'port'; port: number };

export function portEnd(port: number): End {
  return { kind: 'port', port };
}

export function endsEqual(a: End, b: End): boolean {
  return a.port === b.port;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SIZE = 1;
export const MAX_SIZE = 30;

export function createPuzzle(w: number, h: number): Puzzle {
  return { w, h, blocked: new Set(), walls: new Set(), endpoints: [], checkpoints: [] };
}

export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    w: p.w,
    h: p.h,
    blocked: new Set(p.blocked),
    walls: new Set(p.walls),
    endpoints: p.endpoints.map((e) => ({ ...e })),
    checkpoints: [...p.checkpoints],
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
  return portCell(s, end.port);
}

/**
 * Tiles where the path must end: the ends, or with checkpoints
 * the first and last checkpoint (just the first while only one is placed).
 */
export function endpointCells(p: Puzzle): number[] {
  const cp = p.checkpoints;
  if (cp.length) return cp.length > 1 ? [cp[0], cp[cp.length - 1]] : [cp[0]];
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
  for (const c of p.checkpoints) {
    const n = mapCell(c);
    if (n >= 0) out.checkpoints.push(n);
  }
  // Ports stay on the same side of the frame.
  out.endpoints = [];
  for (const end of p.endpoints) {
    const [side, i] = portSide(p, end.port);
    const limit = side === 'top' || side === 'bottom' ? w : h;
    if (i < limit) out.endpoints.push(portEnd(portId(out, side, i)));
  }
  return out;
}

/**
 * The ends puzzle equivalent to a loop puzzle (one with no ends or checkpoints):
 * two ends side by side on the right of the frame, as low as both tiles are
 * open. The lower of the two has a black tile or the frame below it, so every
 * loop must step between them; cutting that step gives the path. With no such
 * pair (no loop fits anyway) the puzzle is returned without ends.
 */
export function loopToEnds(p: Puzzle): Puzzle {
  const out = clonePuzzle(p);
  if (p.endpoints.length || p.checkpoints.length) return out;
  for (let r = p.h - 2; r >= 0; r--) {
    const upper = cellAt(p, r, p.w - 1);
    if (!p.blocked.has(upper) && !p.blocked.has(upper + p.w)) {
      out.endpoints = [portEnd(portId(p, 'right', r)), portEnd(portId(p, 'right', r + 1))];
      break;
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
    a.endpoints.length === b.endpoints.length &&
    a.endpoints.every((v, i) => endsEqual(v, b.endpoints[i])) &&
    a.checkpoints.length === b.checkpoints.length &&
    a.checkpoints.every((v, i) => v === b.checkpoints[i])
  );
}

export type Transform = 'rotateLeft' | 'rotateRight' | 'flipH' | 'flipV';

const SIDE_DIR: Record<Side, [number, number]> = { top: [-1, 0], right: [0, 1], bottom: [1, 0], left: [0, -1] };

/**
 * Rotate a quarter turn or mirror the whole puzzle. Black tiles, walls,
 * frame ends (in order) and checkpoints (in order) all move together.
 */
export function transformPuzzle(p: Puzzle, t: Transform): Puzzle {
  const rotates = t === 'rotateLeft' || t === 'rotateRight';
  const out = createPuzzle(rotates ? p.h : p.w, rotates ? p.w : p.h);
  const mapRC = (r: number, c: number): [number, number] => {
    switch (t) {
      case 'rotateRight':
        return [c, p.h - 1 - r];
      case 'rotateLeft':
        return [p.w - 1 - c, r];
      case 'flipH':
        return [r, p.w - 1 - c];
      case 'flipV':
        return [p.h - 1 - r, c];
    }
  };
  const mapDir = ([dr, dc]: [number, number]): [number, number] => {
    switch (t) {
      case 'rotateRight':
        return [dc, -dr];
      case 'rotateLeft':
        return [-dc, dr];
      case 'flipH':
        return [dr, -dc];
      case 'flipV':
        return [-dr, dc];
    }
  };
  const mapCell = (cell: number): number => {
    const [r, c] = mapRC(...cellRC(p, cell));
    return r * out.w + c;
  };
  for (const c of p.blocked) out.blocked.add(mapCell(c));
  for (const e of p.walls) {
    const [a, b] = edgeCells(p, e);
    out.walls.add(edgeBetween(out, mapCell(a), mapCell(b)));
  }
  out.checkpoints = p.checkpoints.map(mapCell);
  out.endpoints = p.endpoints.map((end) => {
    const [side] = portSide(p, end.port);
    const [dr, dc] = mapDir(SIDE_DIR[side]);
    const newSide = (Object.keys(SIDE_DIR) as Side[]).find((s) => SIDE_DIR[s][0] === dr && SIDE_DIR[s][1] === dc)!;
    const [r, c] = cellRC(out, mapCell(portCell(p, end.port)));
    return portEnd(portId(out, newSide, newSide === 'top' || newSide === 'bottom' ? c : r));
  });
  return out;
}

/**
 * Turn a puzzle whose two frame ends are on opposite sides so the path comes
 * in on the left and goes out on the right. With `keepSize`, a non-square
 * board is never turned a quarter (its width and height stay put); ends on
 * the top and bottom then come in at the top.
 */
export function orientEnds(p: Puzzle, keepSize = false): Puzzle {
  if (p.endpoints.length !== 2) return p;
  const [a, b] = p.endpoints.map((e) => portSide(p, e.port)[0]);
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  if (opposite[a] !== b) return p;
  const canTurn = !keepSize || p.w === p.h;
  const steps: Record<Side, Transform | null> = {
    left: null,
    right: 'flipH',
    top: canTurn ? 'rotateLeft' : null,
    bottom: canTurn ? 'rotateRight' : 'flipV',
  };
  const t = steps[a];
  return t ? transformPuzzle(p, t) : p;
}

