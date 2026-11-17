import { cellCount, cellRC, edgeCells, edgeCount, edgeTouchesBlocked, isHorizontalEdge, portCell, portSide, type Puzzle, type Side } from './model';

/** Size of one tile in SVG user units. */
export const CELL = 100;
/** Space around the grid so the outer border and touches near it fit. */
export const PAD = 10;
/** Space around the grid when end arrows are drawn outside the frame. */
export const PORT_PAD = 62;

export interface RenderOptions {
  segments?: Set<number>;
  xMarks?: Set<number>;
  errorCells?: Set<number>;
  errorEdges?: Set<number>;
  /** A solution drawn faintly underneath (e.g. "show solution" in the editor). */
  ghost?: Set<number>;
  /** Draw faint markers on every border so editors can see where to tap. */
  showBorderTargets?: boolean;
  /** Draw faint markers on every frame border where an end could go. */
  showPortTargets?: boolean;
  /** Celebrate a solved board. */
  solved?: boolean;
  /** Margin around the grid in SVG units (default PAD). */
  pad?: number;
}

/** Margin to use for a puzzle: room for end arrows when it has (or may get) ends. */
export function padFor(p: Puzzle, editing = false): number {
  return editing || (p.mode === 'path' && p.endpoints.length > 0) ? PORT_PAD : PAD;
}

export function boardSize(p: Puzzle, pad = PAD): { width: number; height: number } {
  return { width: p.w * CELL + 2 * pad, height: p.h * CELL + 2 * pad };
}

let clipCounter = 0;

/** Outward unit vector for each side of the frame. */
const OUT: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

export function renderBoard(svg: SVGSVGElement, p: Puzzle, o: RenderOptions = {}): void {
  const pad = o.pad ?? PAD;
  const { width, height } = boardSize(p, pad);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.dataset.pad = String(pad);
  svg.classList.toggle('solved', !!o.solved);

  const center = (cell: number): [number, number] => {
    const [r, c] = cellRC(p, cell);
    return [pad + (c + 0.5) * CELL, pad + (r + 0.5) * CELL];
  };
  const borderLine = (e: number): [number, number, number, number] => {
    const [a] = edgeCells(p, e);
    const [r, c] = cellRC(p, a);
    if (isHorizontalEdge(p, e)) {
      const x = pad + (c + 1) * CELL;
      return [x, pad + r * CELL, x, pad + (r + 1) * CELL];
    }
    const y = pad + (r + 1) * CELL;
    return [pad + c * CELL, y, pad + (c + 1) * CELL, y];
  };
  /** Midpoint of a port's border, and its outward direction. */
  const portPoint = (port: number): { x: number; y: number; d: [number, number] } => {
    const [side] = portSide(p, port);
    const [cx, cy] = center(portCell(p, port));
    const d = OUT[side];
    return { x: cx + (d[0] * CELL) / 2, y: cy + (d[1] * CELL) / 2, d };
  };
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) =>
    `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const segmentLine = (e: number, cls: string) => {
    const [a, b] = edgeCells(p, e);
    const [x1, y1] = center(a);
    const [x2, y2] = center(b);
    return line(x1, y1, x2, y2, cls);
  };

  const parts: string[] = [];
  const n = cellCount(p);
  const E = edgeCount(p);
  const ports = p.mode === 'path' ? p.endpoints.slice(0, 2) : [];

  // Tiles.
  parts.push('<g class="tiles">');
  for (let i = 0; i < n; i++) {
    const [r, c] = cellRC(p, i);
    const cls = p.blocked.has(i) ? 'tile blocked' : o.errorCells?.has(i) ? 'tile error' : (r + c) % 2 ? 'tile alt' : 'tile';
    parts.push(`<rect class="${cls}" x="${pad + c * CELL}" y="${pad + r * CELL}" width="${CELL}" height="${CELL}"/>`);
  }
  parts.push('</g>');

  // Grid lines (skip where a wall is drawn).
  parts.push('<g class="grid">');
  for (let e = 0; e < E; e++) {
    if (p.walls.has(e)) continue;
    const [x1, y1, x2, y2] = borderLine(e);
    parts.push(line(x1, y1, x2, y2, 'grid-line'));
  }
  parts.push('</g>');

  if (o.showBorderTargets) {
    parts.push('<g class="targets">');
    for (let e = 0; e < E; e++) {
      if (p.walls.has(e) || edgeTouchesBlocked(p, e)) continue;
      const [x1, y1, x2, y2] = borderLine(e);
      parts.push(`<circle class="border-target" cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="5"/>`);
    }
    parts.push('</g>');
  }

  if (o.showPortTargets) {
    parts.push('<g class="targets">');
    const total = 2 * (p.w + p.h);
    for (let port = 0; port < total; port++) {
      if (ports.includes(port) || p.blocked.has(portCell(p, port))) continue;
      const { x, y, d } = portPoint(port);
      parts.push(`<circle class="border-target" cx="${x + d[0] * 26}" cy="${y + d[1] * 26}" r="6"/>`);
    }
    parts.push('</g>');
  }

  // Walls (clipped to the grid so their rounded ends never poke past the frame), then the outer border.
  svg.dataset.clipId ??= `grid-clip-${++clipCounter}`;
  const clipId = svg.dataset.clipId;
  parts.push(
    `<defs><clipPath id="${clipId}"><rect x="${pad}" y="${pad}" width="${p.w * CELL}" height="${p.h * CELL}"/></clipPath></defs>`,
  );
  parts.push(`<g class="walls" clip-path="url(#${clipId})">`);
  for (const e of p.walls) {
    const [x1, y1, x2, y2] = borderLine(e);
    parts.push(line(x1, y1, x2, y2, 'wall'));
  }
  // Black tiles are outlined as if walled on every side, giving them rounded, bulging edges.
  for (const cell of p.blocked) {
    const [r, c] = cellRC(p, cell);
    const x0 = pad + c * CELL;
    const y0 = pad + r * CELL;
    const x1 = x0 + CELL;
    const y1 = y0 + CELL;
    parts.push(
      line(x0, y0, x1, y0, 'wall'),
      line(x1, y0, x1, y1, 'wall'),
      line(x1, y1, x0, y1, 'wall'),
      line(x0, y1, x0, y0, 'wall'),
    );
  }
  parts.push('</g><g class="frame">');
  parts.push(`<rect class="outer" x="${pad}" y="${pad}" width="${p.w * CELL}" height="${p.h * CELL}" rx="4"/>`);
  parts.push('</g>');

  // Fixed ends: a path stub from the tile centre to the frame, and an arrow outside it.
  if (ports.length) {
    parts.push('<g class="ends">');
    ports.forEach((port, i) => {
      const { x, y, d } = portPoint(port);
      const [cx, cy] = center(portCell(p, port));
      parts.push(line(cx, cy, x, y, 'end-seg'));
      parts.push(`<circle class="end-joint" cx="${cx}" cy="${cy}" r="11"/>`);
      parts.push(arrow(x, y, d, i === 0 ? 'in' : 'out'));
    });
    parts.push('</g>');
  }

  if (o.ghost?.size) {
    parts.push('<g class="ghost">');
    for (const e of o.ghost) parts.push(segmentLine(e, 'ghost-seg'));
    parts.push('</g>');
  }

  // Path segments: givens beneath player segments.
  parts.push('<g class="segments">');
  for (const e of p.givens) parts.push(segmentLine(e, o.errorEdges?.has(e) ? 'given-seg error' : 'given-seg'));
  for (const e of o.segments ?? []) {
    if (p.givens.has(e)) continue;
    parts.push(segmentLine(e, o.errorEdges?.has(e) ? 'seg error' : 'seg'));
  }
  // Dots at tile centres touched by the path make joins look tidy.
  const touched = new Map<number, boolean>(); // cell -> touched by a player segment
  for (const e of p.givens) for (const c of edgeCells(p, e)) if (!touched.has(c)) touched.set(c, false);
  for (const e of o.segments ?? []) {
    if (p.givens.has(e)) continue;
    for (const c of edgeCells(p, e)) touched.set(c, true);
  }
  for (const [c, byPlayer] of touched) {
    const [x, y] = center(c);
    const cls = o.errorCells?.has(c) ? 'joint error' : byPlayer ? 'joint' : 'joint given';
    parts.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="11"/>`);
  }
  parts.push('</g>');

  // X marks.
  if (o.xMarks?.size) {
    parts.push('<g class="xmarks">');
    const s = 12;
    for (const e of o.xMarks) {
      const [x1, y1, x2, y2] = borderLine(e);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      parts.push(line(cx - s, cy - s, cx + s, cy + s, 'xmark'), line(cx - s, cy + s, cx + s, cy - s, 'xmark'));
    }
    parts.push('</g>');
  }

  svg.innerHTML = parts.join('');
}

/**
 * Arrow outside the frame at border point (x, y) with outward direction d:
 * 'in' points toward the grid, 'out' points away from it.
 */
function arrow(x: number, y: number, d: [number, number], dir: 'in' | 'out'): string {
  const [dx, dy] = d;
  const at = (t: number, side = 0): string => `${x + dx * t - dy * side},${y + dy * t + dx * side}`;
  const half = 17;
  // Distances are measured outward from the frame.
  const [shaftFrom, shaftTo, tip, base] = dir === 'in' ? [56, 30, 8, 32] : [8, 32, 54, 30];
  return (
    `<line class="end-arrow-shaft" x1="${x + dx * shaftFrom}" y1="${y + dy * shaftFrom}" x2="${x + dx * shaftTo}" y2="${y + dy * shaftTo}"/>` +
    `<polygon class="end-arrow-head" points="${at(tip)} ${at(base, half)} ${at(base, -half)}"/>`
  );
}
