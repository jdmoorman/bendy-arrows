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
   * Up to two ends, each a port (outer border of the frame, see portCell)
   * where the path enters or leaves. The first is the entrance.
   */
  endpoints: End[];
  /**
   * A one-shot puzzle: the path is drawn as one stroke from the entrance, and hints and the
   * logic helper follow that stroke. Only kept with both ends placed.
   */
  oneShot?: boolean;
}

/** A fixed end of the path: a border segment (port) on the outer frame. */
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
  return { w, h, blocked: new Set(), walls: new Set(), endpoints: [] };
}

export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    w: p.w,
    h: p.h,
    blocked: new Set(p.blocked),
    walls: new Set(p.walls),
    endpoints: p.endpoints.map((e) => ({ ...e })),
    ...(p.oneShot ? { oneShot: true } : {}),
  };
}

/** Whether a puzzle plays as a one-shot: flagged so, with an entrance and an exit. */
export function isOneShot(p: Puzzle): boolean {
  return !!p.oneShot && p.endpoints.length === 2;
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

/** Tiles where the path must end: the tiles inside the ends. */
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
 * A puzzle with its rows and columns rearranged: row i of the result is old row `rows[i]`
 * (or a new, empty row where that is -1), and likewise for `cols`. Black tiles on kept lines
 * stay; a wall stays when both its tiles are kept and still next to each other; an end stays
 * on its side of the frame when its row (or column) is kept.
 */
export function remapGrid(p: Puzzle, rows: number[], cols: number[]): Puzzle {
  const out = createPuzzle(cols.length, rows.length);
  const at = (cell: number): [number, number] => {
    const [r, c] = cellRC(p, cell);
    return [rows.indexOf(r), cols.indexOf(c)];
  };
  for (const cell of p.blocked) {
    const [r, c] = at(cell);
    if (r >= 0 && c >= 0) out.blocked.add(r * out.w + c);
  }
  for (const e of p.walls) {
    const [[ra, ca], [rb, cb]] = edgeCells(p, e).map(at);
    if (ra < 0 || ca < 0 || rb < 0 || cb < 0 || Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) continue;
    out.walls.add(edgeBetween(out, ra * out.w + ca, rb * out.w + cb));
  }
  out.endpoints = [];
  for (const end of p.endpoints) {
    const [side, i] = portSide(p, end.port);
    const j = side === 'top' || side === 'bottom' ? cols.indexOf(i) : rows.indexOf(i);
    if (j >= 0) out.endpoints.push({ ...end, port: portId(out, side, j) });
  }
  if (p.oneShot) out.oneShot = true;
  return out;
}

/** A new, empty row (or column) inserted before line `at` (0 to the count: at the end). */
export function insertLine(p: Puzzle, axis: 'row' | 'col', at: number): Puzzle {
  const keep = (n: number) => Array.from({ length: n }, (_, i) => i);
  const grow = (n: number) => [...keep(at), -1, ...keep(n).slice(at)];
  return axis === 'row' ? remapGrid(p, grow(p.h), keep(p.w)) : remapGrid(p, keep(p.h), grow(p.w));
}

/** Row (or column) `at` taken out, the lines either side closing up. */
export function deleteLine(p: Puzzle, axis: 'row' | 'col', at: number): Puzzle {
  const keep = (n: number) => Array.from({ length: n }, (_, i) => i);
  const less = (n: number) => keep(n).filter((i) => i !== at);
  return axis === 'row' ? remapGrid(p, less(p.h), keep(p.w)) : remapGrid(p, keep(p.h), less(p.w));
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
  // Ports stay on the same side of the frame.
  out.endpoints = [];
  for (const end of p.endpoints) {
    const [side, i] = portSide(p, end.port);
    const limit = side === 'top' || side === 'bottom' ? w : h;
    if (i < limit) out.endpoints.push(portEnd(portId(out, side, i)));
  }
  if (p.oneShot) out.oneShot = true;
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
    isOneShot(a) === isOneShot(b)
  );
}

export type Transform = 'rotateLeft' | 'rotateRight' | 'flipH' | 'flipV';

const SIDE_DIR: Record<Side, [number, number]> = { top: [-1, 0], right: [0, 1], bottom: [1, 0], left: [0, -1] };

/**
 * Rotate a quarter turn or mirror the whole puzzle. Black tiles, walls,
 * and frame ends (in order) all move together.
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
  out.endpoints = p.endpoints.map((end) => {
    const [side] = portSide(p, end.port);
    const [dr, dc] = mapDir(SIDE_DIR[side]);
    const newSide = (Object.keys(SIDE_DIR) as Side[]).find((s) => SIDE_DIR[s][0] === dr && SIDE_DIR[s][1] === dc)!;
    const [r, c] = cellRC(out, mapCell(portCell(p, end.port)));
    return portEnd(portId(out, newSide, newSide === 'top' || newSide === 'bottom' ? c : r));
  });
  if (p.oneShot) out.oneShot = true;
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

/** The puzzle turned and mirrored all 8 ways (the first is the puzzle itself). */
export function orientations(p: Puzzle): Puzzle[] {
  const out: Puzzle[] = [];
  let q = p;
  for (let r = 0; r < 4; r++) {
    out.push(q, transformPuzzle(q, 'flipH'));
    q = transformPuzzle(q, 'rotateRight');
  }
  return out;
}

/**
 * The ways a level may be turned or mirrored: all 8 for a square, otherwise only those that
 * keep its width and height (as it is, mirrored either way, or turned half round).
 */
function levelTurns(p: Puzzle): Puzzle[] {
  if (p.w === p.h) return orientations(p);
  const flipped = transformPuzzle(p, 'flipH');
  return [p, flipped, transformPuzzle(p, 'flipV'), transformPuzzle(flipped, 'flipV')];
}

const OPPOSITE: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** For each end, the sides its arrow can come in from: its own first, then its corner's other side if it's on a corner tile. */
function cornerChoices(p: Puzzle): { side: Side; port: number }[][] {
  return p.endpoints.map((end) => {
    const [side] = portSide(p, end.port);
    const [r, c] = cellRC(p, portCell(p, end.port));
    const sides: Side[] = [side];
    for (const [s, on] of [['top', r === 0], ['bottom', r === p.h - 1], ['left', c === 0], ['right', c === p.w - 1]] as [Side, boolean][]) {
      if (on && s !== side) sides.push(s);
    }
    return sides.map((s) => ({ side: s, port: portId(p, s, s === 'top' || s === 'bottom' ? c : r) }));
  });
}

/** The same level with its arrows on any side of their corner tiles, turned or mirrored any way: every code it might once have had. */
export function endVariants(p: Puzzle): Puzzle[] {
  let out: Puzzle[] = [p];
  cornerChoices(p).forEach((options, i) => {
    out = out.flatMap((q) => options.map((o) => ({ ...q, endpoints: q.endpoints.map((end, j) => (j === i ? { ...end, port: o.port } : end)) })));
  });
  return out.flatMap(orientations);
}

/**
 * The ends' arrows moved round their corner tiles, where that helps: an end on a corner tile
 * can come in from either of the corner's two sides (the path is the same). Best is the two
 * arrows on opposite sides, then on the same side; failing both, or if they already are, the
 * ends stay as they were (and otherwise move as few as they can).
 */
export function cornerEnds(p: Puzzle): Puzzle {
  if (p.endpoints.length !== 2) return p;
  const choices = cornerChoices(p);
  const fit = (a: Side, b: Side) => (OPPOSITE[a] === b ? 2 : a === b ? 1 : 0);
  let best = { score: -1, moves: 0, ports: [0, 0] };
  choices[0].forEach((a, i) =>
    choices[1].forEach((b, j) => {
      const score = fit(a.side, b.side);
      const moves = (i ? 1 : 0) + (j ? 1 : 0);
      if (score > best.score || (score === best.score && moves < best.moves)) best = { score, moves, ports: [a.port, b.port] };
    }),
  );
  if (!best.moves) return p;
  return { ...p, endpoints: p.endpoints.map((end, i) => ({ ...end, port: best.ports[i] })) };
}

/**
 * How well placed the ends are: the tail (first end) on the left edge first, then the head on
 * the side opposite the tail, then the tail in the bottom half, then in the left half.
 */
function tailScore(p: Puzzle): number {
  const [side] = portSide(p, p.endpoints[0].port);
  const head = p.endpoints[1] ? portSide(p, p.endpoints[1].port)[0] : null;
  const [r, c] = cellRC(p, portCell(p, p.endpoints[0].port));
  return (side === 'left' ? 8 : 0) + (head === OPPOSITE[side] ? 4 : 0) + (2 * r >= p.h - 1 ? 2 : 0) + (2 * c <= p.w - 1 ? 1 : 0);
}

/**
 * Whether a level's ends are as well placed as they can be: arrows on corner tiles already on
 * the best side of their corner (see `cornerEnds`), and the level turned or mirrored (see
 * `levelTurns`) so the tail is on the left edge with the head opposite, low, where it can be
 * (see `tailScore`). Levels without frame ends pass.
 */
export function tailLeftLow(p: Puzzle): boolean {
  if (!p.endpoints.length) return true;
  if (cornerEnds(p) !== p) return false;
  return tailScore(p) === Math.max(...levelTurns(p).map(tailScore));
}

/**
 * A level with its ends placed as well as they can be (see `tailLeftLow`): first the arrows
 * moved round their corners, then turned or mirrored. Of the ways that do, the one whose head
 * is lowest, then furthest right. Levels that already pass are returned as they are.
 */
export function orientTail(p: Puzzle): Puzzle {
  if (tailLeftLow(p)) return p;
  const q = cornerEnds(p);
  if (tailLeftLow(q)) return q;
  const headAt = (x: Puzzle) => (x.endpoints[1] ? cellRC(x, portCell(x, x.endpoints[1].port)) : [0, 0]);
  const fits = levelTurns(q).filter(tailLeftLow);
  fits.sort((a, b) => headAt(b)[0] - headAt(a)[0] || headAt(b)[1] - headAt(a)[1]);
  return fits[0];
}

/**
 * A key that's the same for two levels exactly when they're the same puzzle: turned or
 * mirrored, with their corner arrows on either side or their ends swapped, one-shot or not.
 */
export function levelKey(p: Puzzle): string {
  const one = (q: Puzzle) => {
    const num = (xs: Iterable<number>) => [...xs].sort((x, y) => x - y).join(',');
    const walls = [...q.walls].map((e) => edgeCells(q, e).join('-')).sort();
    return `${q.w}x${q.h}|${num(q.blocked)}|${walls.join(',')}|${num(q.endpoints.map((e) => e.port))}`;
  };
  return endVariants(p).map(one).sort()[0];
}

/**
 * A key for a solution path's shape: the same for two paths exactly when one is the other
 * turned or mirrored (whatever obstacles and ends the puzzles have). `edges` are the path's lines.
 */
export function pathKey(s: Size, edges: Iterable<number>): string {
  const { w, h } = s;
  const pairs = [...edges].map((e) => edgeCells(s, e).map((c) => cellRC(s, c)));
  // The 8 ways to turn or mirror a w×h grid: where (r, c) goes, and the new width.
  const maps: [(r: number, c: number) => [number, number], number][] = [
    [(r, c) => [r, c], w],
    [(r, c) => [r, w - 1 - c], w],
    [(r, c) => [h - 1 - r, c], w],
    [(r, c) => [h - 1 - r, w - 1 - c], w],
    [(r, c) => [c, r], h],
    [(r, c) => [c, h - 1 - r], h],
    [(r, c) => [w - 1 - c, r], h],
    [(r, c) => [w - 1 - c, h - 1 - r], h],
  ];
  const keys = maps.map(([f, nw]) => {
    const lines = pairs.map(([[r1, c1], [r2, c2]]) => {
      const [a, b] = [f(r1, c1), f(r2, c2)].map(([r, c]) => r * nw + c).sort((x, y) => x - y);
      return `${a}-${b}`;
    });
    return `${nw}x${(w * h) / nw}:${lines.sort().join(',')}`;
  });
  return keys.sort()[0];
}
