import { cellCount, cellRC, edgeCells, edgeCount, isHorizontalEdge, type Puzzle } from './model';

/** Size of one tile in SVG user units. */
export const CELL = 100;
/** Space around the grid so the outer border and touches near it fit. */
export const PAD = 10;

export interface RenderOptions {
  segments?: Set<number>;
  xMarks?: Set<number>;
  errorCells?: Set<number>;
  errorEdges?: Set<number>;
  /** A solution drawn faintly underneath (e.g. "show solution" in the editor). */
  ghost?: Set<number>;
  /** Draw faint markers on every border so editors can see where to tap. */
  showBorderTargets?: boolean;
  /** Celebrate a solved board. */
  solved?: boolean;
}

export function boardSize(p: Puzzle): { width: number; height: number } {
  return { width: p.w * CELL + 2 * PAD, height: p.h * CELL + 2 * PAD };
}

function center(p: Puzzle, cell: number): [number, number] {
  const [r, c] = cellRC(p, cell);
  return [PAD + (c + 0.5) * CELL, PAD + (r + 0.5) * CELL];
}

/** The border line an edge sits on, as [x1, y1, x2, y2]. */
export function borderLine(p: Puzzle, e: number): [number, number, number, number] {
  const [a] = edgeCells(p, e);
  const [r, c] = cellRC(p, a);
  if (isHorizontalEdge(p, e)) {
    const x = PAD + (c + 1) * CELL;
    return [x, PAD + r * CELL, x, PAD + (r + 1) * CELL];
  }
  const y = PAD + (r + 1) * CELL;
  return [PAD + c * CELL, y, PAD + (c + 1) * CELL, y];
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function segmentLine(p: Puzzle, e: number, cls: string): string {
  const [a, b] = edgeCells(p, e);
  const [x1, y1] = center(p, a);
  const [x2, y2] = center(p, b);
  return line(x1, y1, x2, y2, cls);
}

export function renderBoard(svg: SVGSVGElement, p: Puzzle, o: RenderOptions = {}): void {
  const { width, height } = boardSize(p);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.classList.toggle('solved', !!o.solved);
  const parts: string[] = [];
  const n = cellCount(p);
  const E = edgeCount(p);

  // Tiles.
  parts.push('<g class="tiles">');
  for (let i = 0; i < n; i++) {
    const [r, c] = cellRC(p, i);
    const cls = p.blocked.has(i) ? 'tile blocked' : o.errorCells?.has(i) ? 'tile error' : (r + c) % 2 ? 'tile alt' : 'tile';
    parts.push(`<rect class="${cls}" x="${PAD + c * CELL}" y="${PAD + r * CELL}" width="${CELL}" height="${CELL}"/>`);
  }
  parts.push('</g>');

  // Grid lines (skip where a wall is drawn).
  parts.push('<g class="grid">');
  for (let e = 0; e < E; e++) {
    if (p.walls.has(e)) continue;
    const [x1, y1, x2, y2] = borderLine(p, e);
    parts.push(line(x1, y1, x2, y2, 'grid-line'));
  }
  parts.push('</g>');

  if (o.showBorderTargets) {
    parts.push('<g class="targets">');
    for (let e = 0; e < E; e++) {
      if (p.walls.has(e)) continue;
      const [x1, y1, x2, y2] = borderLine(p, e);
      parts.push(`<circle class="border-target" cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="5"/>`);
    }
    parts.push('</g>');
  }

  // Walls, then the outer border.
  parts.push('<g class="walls">');
  for (const e of p.walls) {
    const [x1, y1, x2, y2] = borderLine(p, e);
    parts.push(line(x1, y1, x2, y2, 'wall'));
  }
  parts.push(`<rect class="outer" x="${PAD}" y="${PAD}" width="${p.w * CELL}" height="${p.h * CELL}" rx="4"/>`);
  parts.push('</g>');

  if (o.ghost?.size) {
    parts.push('<g class="ghost">');
    for (const e of o.ghost) parts.push(segmentLine(p, e, 'ghost-seg'));
    parts.push('</g>');
  }

  // Path segments: givens beneath player segments.
  parts.push('<g class="segments">');
  for (const e of p.givens) parts.push(segmentLine(p, e, o.errorEdges?.has(e) ? 'given-seg error' : 'given-seg'));
  for (const e of o.segments ?? []) {
    if (p.givens.has(e)) continue;
    parts.push(segmentLine(p, e, o.errorEdges?.has(e) ? 'seg error' : 'seg'));
  }
  // Dots at tile centres touched by the path make joins look tidy.
  const touched = new Map<number, boolean>(); // cell -> touched by a player segment
  for (const e of p.givens) for (const c of edgeCells(p, e)) if (!touched.has(c)) touched.set(c, false);
  for (const e of o.segments ?? []) {
    if (p.givens.has(e)) continue;
    for (const c of edgeCells(p, e)) touched.set(c, true);
  }
  for (const [c, byPlayer] of touched) {
    const [x, y] = center(p, c);
    const cls = o.errorCells?.has(c) ? 'joint error' : byPlayer ? 'joint' : 'joint given';
    parts.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="11"/>`);
  }
  parts.push('</g>');

  // Endpoints.
  if (p.mode === 'path' && p.endpoints.length) {
    parts.push('<g class="endpoints">');
    for (const c of p.endpoints) {
      const [x, y] = center(p, c);
      parts.push(`<circle class="endpoint" cx="${x}" cy="${y}" r="22"/>`);
    }
    parts.push('</g>');
  }

  // X marks.
  if (o.xMarks?.size) {
    parts.push('<g class="xmarks">');
    const s = 12;
    for (const e of o.xMarks) {
      const [x1, y1, x2, y2] = borderLine(p, e);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      parts.push(line(cx - s, cy - s, cx + s, cy + s, 'xmark'), line(cx - s, cy + s, cx + s, cy - s, 'xmark'));
    }
    parts.push('</g>');
  }

  svg.innerHTML = parts.join('');
}
