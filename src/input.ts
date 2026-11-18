import { cellRC, edgeBetween, edgeCells, portEnd, portId, type End, type Puzzle } from './model';
import { CELL, PAD } from './render';

/**
 * Pointer handling for the board. Works the same for touch, pen and mouse.
 *
 * Three gesture kinds:
 *   - 'path':  drag from tile to tile (onStep for each move between adjacent
 *              tiles); tap a border → onTapEdge; tap a tile → onTapCell;
 *              right-click a border → onSecondaryEdge. A drag that starts
 *              on a border moves from the tile it started in. While
 *              dragging, onHoverEdge reports each border the pointer passes
 *              close to (used for erasing).
 *   - 'edges': a stroke of borders (onPaintEdge), starting with the one under
 *              the initial touch. Adding, it follows the grid's corners: it
 *              only turns when the pointer clearly heads off along another
 *              line, so brushing past a crossing border doesn't add a stub
 *              (see continueWallStroke). Erasing (strokeErases), it takes
 *              every border the pointer comes nearest to.
 *   - 'cells': every tile the pointer touches is painted (onPaintCell), and
 *              borders it passes close to are reported (onStrokeEdge).
 *   - 'ends':  a tap outside the grid picks the nearest frame border (port)
 *              → onTapEnd. Taps inside the grid are ignored.
 */

export type DragKind = 'path' | 'edges' | 'cells' | 'ends';

export interface BoardHandlers {
  kind(): DragKind;
  onGestureStart?(): void;
  onGestureEnd?(): void;
  /** Path drag moved between adjacent tiles. Return false to refuse (the drag stays on `from`). */
  onStep?(from: number, to: number): boolean;
  /** Path drag started on a tile. */
  /** Path gesture started on a tile; `edge` is the border under the pointer, or -1. */
  onPathStart?(cell: number, edge: number): void;
  /** Path drag passed close to a border. */
  onHoverEdge?(edge: number): void;
  onTapEdge?(edge: number): void;
  onTapCell?(cell: number): void;
  /** Right-click on a border. */
  onSecondaryEdge?(edge: number): void;
  /** `cell` is the tile under the pointer (so a stroke starting on a black tile can erase it). */
  onPaintEdge?(edge: number, first: boolean, cell: number): void;
  /** During an erasing 'edges' stroke: the tile under the pointer, each time it changes. */
  onStrokeCell?(cell: number): void;
  /** During a 'cells' stroke: a border the pointer comes close to (within EDGE_TOLERANCE). */
  onStrokeEdge?(edge: number): void;
  /** Asked after the first border of an 'edges' stroke is painted: is this stroke erasing? */
  strokeErases?(): boolean;
  onPaintCell?(cell: number, first: boolean): void;
  onTapEnd?(end: End): void;
}

export interface Hit {
  /** Tile under the point. */
  cell: number;
  /** Nearest interior border within tolerance, or -1. */
  edge: number;
  /** Distance (in tiles) from the point to that border. */
  edgeDist: number;
}

/** Fraction of a tile, measured from a border, that counts as touching that border. */
export const EDGE_TOLERANCE = 0.28;
/** How far into a new tile a drag must reach before it counts (reduces jitter at corners). */
const ENTER_MARGIN = 0.12;

/**
 * Classify a point given in tile units (x = column, y = row, fractional).
 * Returns null when the point is outside the grid.
 */
export function hitTest(p: Puzzle, x: number, y: number, tolerance = EDGE_TOLERANCE): Hit | null {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return null;
  const c = Math.floor(x);
  const r = Math.floor(y);
  const cell = r * p.w + c;
  const fx = x - c;
  const fy = y - r;
  // Candidate borders: [distance, neighbour cell]; outer borders are skipped.
  const cands: [number, number][] = [];
  if (c > 0) cands.push([fx, cell - 1]);
  if (c < p.w - 1) cands.push([1 - fx, cell + 1]);
  if (r > 0) cands.push([fy, cell - p.w]);
  if (r < p.h - 1) cands.push([1 - fy, cell + p.w]);
  cands.sort((a, b) => a[0] - b[0]);
  if (!cands.length || cands[0][0] > tolerance) return { cell, edge: -1, edgeDist: Infinity };
  return { cell, edge: edgeBetween(p, cell, cands[0][1]), edgeDist: cands[0][0] };
}

/**
 * The frame border (port) nearest a point in tile units, or -1 if the point
 * is more than `reach` tiles inside the frame.
 */
export function portAt(p: Puzzle, x: number, y: number, reach = 1): number {
  const dists: [number, 'top' | 'right' | 'bottom' | 'left'][] = [
    [y, 'top'],
    [p.w - x, 'right'],
    [p.h - y, 'bottom'],
    [x, 'left'],
  ];
  dists.sort((a, b) => a[0] - b[0]);
  const [dist, side] = dists[0];
  if (dist > reach) return -1;
  const along = side === 'top' || side === 'bottom' ? x : y;
  const limit = side === 'top' || side === 'bottom' ? p.w : p.h;
  if (along < 0 || along >= limit) return -1; // beyond a corner
  return portId(p, side, Math.floor(along));
}

/** A corner of the grid, in tile units: x from 0 to w, y from 0 to h. */
type Corner = [number, number];

/** The two corners a border runs between. */
function borderEnds(p: Puzzle, e: number): [Corner, Corner] {
  const [a, b] = edgeCells(p, e);
  const [r, c] = cellRC(p, a);
  // Tiles side by side share a vertical border; tiles one above the other a horizontal one.
  return b === a + 1 ? [[c + 1, r], [c + 1, r + 1]] : [[c, r + 1], [c + 1, r + 1]];
}

/** The interior border between two neighbouring corners, or -1 (on the frame, or off the board). */
function borderBetween(p: Puzzle, [x1, y1]: Corner, [x2, y2]: Corner): number {
  if (y1 === y2) {
    const x = Math.min(x1, x2);
    return y1 >= 1 && y1 <= p.h - 1 && x >= 0 && x <= p.w - 1 ? edgeBetween(p, (y1 - 1) * p.w + x, y1 * p.w + x) : -1;
  }
  const y = Math.min(y1, y2);
  return x1 >= 1 && x1 <= p.w - 1 && y >= 0 && y <= p.h - 1 ? edgeBetween(p, y * p.w + x1 - 1, y * p.w + x1) : -1;
}

/** A wall stroke in progress: the border it started on, and the corner it has reached. */
export interface WallStroke {
  first: number;
  corner: Corner | null;
}

/** How far (in tiles) the pointer must go from the stroke's corner along a line to extend it. */
const STROKE_STEP = 0.5;
/** When the finger lifts, one more border it's heading along counts from this far along. */
export const STROKE_END_STEP = 0.25;

/**
 * Extend a wall stroke toward the pointer at (x, y) in tile units, returning the borders to
 * paint, in order. The stroke moves from corner to corner of the grid: it takes the next border
 * only once the pointer is half a tile along it from the current corner. A finger sliding along
 * a line of walls passes straight through each corner, while brushing a crossing border moves
 * it well under half a tile sideways, so straight strokes stay straight. Dragging back over the
 * stroke moves its corner back, so a deliberate double-back can still branch from there.
 */
export function continueWallStroke(p: Puzzle, s: WallStroke, x: number, y: number, step = STROKE_STEP, maxSteps = Infinity): number[] {
  if (!s.corner) {
    // Which end of the first border is the stroke heading for? Wait until the pointer has
    // clearly left the border's middle, then take the nearer end.
    const [a, b] = borderEnds(p, s.first);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (Math.hypot(x - mx, y - my) < 0.3) return [];
    s.corner = Math.hypot(x - a[0], y - a[1]) <= Math.hypot(x - b[0], y - b[1]) ? a : b;
  }
  const out: number[] = [];
  for (let guard = 0; guard < Math.min(maxSteps, p.w + p.h + 4); guard++) {
    const [cx, cy] = s.corner;
    const dx = x - cx;
    const dy = y - cy;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const d = horizontal ? dx : dy;
    if (Math.abs(d) < step) break;
    const next: Corner = horizontal ? [cx + Math.sign(d), cy] : [cx, cy + Math.sign(d)];
    if (next[0] < 0 || next[0] > p.w || next[1] < 0 || next[1] > p.h) break;
    const e = borderBetween(p, s.corner, next);
    s.corner = next;
    if (e >= 0) out.push(e);
  }
  return out;
}

/** Next tile one orthogonal step from `from` toward `to`. */
export function stepToward(p: Puzzle, from: number, to: number): number {
  const [r1, c1] = cellRC(p, from);
  const [r2, c2] = cellRC(p, to);
  const dr = r2 - r1;
  const dc = c2 - c1;
  if (Math.abs(dc) >= Math.abs(dr) && dc !== 0) return from + Math.sign(dc);
  if (dr !== 0) return from + Math.sign(dr) * p.w;
  return from;
}

export function attachBoardInput(svg: SVGSVGElement, getPuzzle: () => Puzzle, h: BoardHandlers): () => void {
  let active: {
    id: number;
    kind: DragKind;
    start: Hit;
    lastCell: number;
    lastEdge: number;
    moved: boolean;
    stroke: WallStroke | null;
  } | null = null;

  const toGrid = (ev: PointerEvent | MouseEvent): [number, number] => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return [-1, -1];
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    const pad = Number(svg.dataset.pad ?? PAD);
    return [(pt.x - pad) / CELL, (pt.y - pad) / CELL];
  };

  const clampHit = (p: Puzzle, x: number, y: number, tol: number): Hit =>
    hitTest(p, Math.min(Math.max(x, 0), p.w - 1e-6), Math.min(Math.max(y, 0), p.h - 1e-6), tol)!;

  const finish = () => {
    if (!active) return;
    active = null;
    h.onGestureEnd?.();
  };

  const onDown = (ev: PointerEvent) => {
    const p = getPuzzle();
    const [x, y] = toGrid(ev);
    if (ev.pointerType === 'mouse' && ev.button === 2) {
      ev.preventDefault();
      const hit = hitTest(p, x, y, Infinity);
      if (hit && hit.edge >= 0) {
        h.onGestureStart?.();
        h.onSecondaryEdge?.(hit.edge);
        h.onGestureEnd?.();
      }
      return;
    }
    if (ev.button !== 0 || active) return;
    const kind = h.kind();
    if (kind === 'ends') {
      const inside = x >= 0 && y >= 0 && x < p.w && y < p.h;
      const port = inside ? -1 : portAt(p, x, y);
      if (port < 0) return;
      const end = portEnd(port);
      ev.preventDefault();
      h.onGestureStart?.();
      h.onTapEnd?.(end);
      h.onGestureEnd?.();
      return;
    }
    const hit = hitTest(p, x, y, kind === 'edges' ? Infinity : EDGE_TOLERANCE);
    if (!hit) return;
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    active = {
      id: ev.pointerId,
      kind,
      start: hit,
      lastCell: hit.cell,
      lastEdge: hit.edge,
      moved: false,
      stroke: kind === 'edges' && hit.edge >= 0 ? { first: hit.edge, corner: null } : null,
    };
    h.onGestureStart?.();
    if (kind === 'edges') {
      if (hit.edge >= 0) h.onPaintEdge?.(hit.edge, true, hit.cell);
      // Erasing takes whatever the pointer touches, so it doesn't follow corners.
      if (h.strokeErases?.()) active.stroke = null;
    } else if (kind === 'cells') {
      h.onPaintCell?.(hit.cell, true);
    } else {
      h.onPathStart?.(hit.cell, hit.edge);
    }
  };

  const onMove = (ev: PointerEvent) => {
    if (!active || ev.pointerId !== active.id) return;
    const p = getPuzzle();
    const [x, y] = toGrid(ev);
    if (active.kind === 'edges') {
      if (!active.stroke) {
        // Erasing: every border the pointer comes nearest to, and every tile it passes over.
        const hit = clampHit(p, x, y, Infinity);
        if (hit.edge >= 0 && hit.edge !== active.lastEdge) {
          active.moved = true;
          active.lastEdge = hit.edge;
          h.onPaintEdge?.(hit.edge, false, hit.cell);
        }
        if (hit.cell !== active.lastCell) {
          active.moved = true;
          active.lastCell = hit.cell;
          h.onStrokeCell?.(hit.cell);
        }
        return;
      }
      for (const e of continueWallStroke(p, active.stroke, x, y)) {
        active.moved = true;
        if (e === active.lastEdge) continue;
        active.lastEdge = e;
        h.onPaintEdge?.(e, false, -1);
      }
      return;
    }
    if (active.kind === 'cells' && h.onStrokeEdge) {
      const near = hitTest(p, x, y, EDGE_TOLERANCE);
      if (near && near.edge >= 0 && near.edge !== active.lastEdge) {
        active.lastEdge = near.edge;
        h.onStrokeEdge(near.edge);
      }
    }
    if (active.kind === 'path' && h.onHoverEdge) {
      const near = hitTest(p, x, y, EDGE_TOLERANCE);
      if (near && near.edge >= 0) h.onHoverEdge(near.edge);
    }
    const hit = clampHit(p, x, y, 0);
    if (hit.cell === active.lastCell) return;
    // Require the pointer to be a little way inside the new tile.
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const inside = Math.min(fx, 1 - fx, fy, 1 - fy) >= ENTER_MARGIN || x < 0 || y < 0 || x >= p.w || y >= p.h;
    if (!inside) return;
    active.moved = true;
    if (active.kind === 'cells') {
      active.lastCell = hit.cell;
      h.onPaintCell?.(hit.cell, false);
      return;
    }
    // Walk one tile at a time so fast drags still draw every segment.
    let guard = p.w + p.h;
    while (active.lastCell !== hit.cell && guard-- > 0) {
      const next = stepToward(p, active.lastCell, hit.cell);
      if (h.onStep?.(active.lastCell, next) === false) break;
      active.lastCell = next;
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!active || ev.pointerId !== active.id) return;
    const a = active;
    // A wall stroke that ends partway along a border still takes it, if it's clearly heading there.
    if (a.kind === 'edges' && a.stroke) {
      const [x, y] = toGrid(ev);
      for (const e of continueWallStroke(getPuzzle(), a.stroke, x, y, STROKE_END_STEP, 1)) {
        if (e !== a.lastEdge) h.onPaintEdge?.(e, false, -1);
        a.lastEdge = e;
      }
    }
    if (a.kind === 'path' && !a.moved) {
      if (a.start.edge >= 0) h.onTapEdge?.(a.start.edge);
      else h.onTapCell?.(a.start.cell);
    }
    finish();
  };

  const onCancel = (ev: PointerEvent) => {
    if (active && ev.pointerId === active.id) finish();
  };

  const onContext = (ev: Event) => ev.preventDefault();

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onCancel);
  svg.addEventListener('contextmenu', onContext);
  return () => {
    svg.removeEventListener('pointerdown', onDown);
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onCancel);
    svg.removeEventListener('contextmenu', onContext);
  };
}
