import { cellRC, edgeBetween, portEnd, portId, type End, type Puzzle } from './model';
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
 *   - 'edges': every border the pointer comes nearest to is painted
 *              (onPaintEdge), starting with the one under the initial touch.
 *   - 'cells': every tile the pointer touches is painted (onPaintCell).
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
  onPaintEdge?(edge: number, first: boolean): void;
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
    };
    h.onGestureStart?.();
    if (kind === 'edges') {
      if (hit.edge >= 0) h.onPaintEdge?.(hit.edge, true);
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
      const hit = clampHit(p, x, y, Infinity);
      if (hit.edge >= 0 && hit.edge !== active.lastEdge) {
        active.moved = true;
        active.lastEdge = hit.edge;
        h.onPaintEdge?.(hit.edge, false);
      }
      return;
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
