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
  /** Segments and X marks to draw in the highlight colour (e.g. the latest logic step). */
  highlight?: Set<number>;
}

/** Margin to use for a puzzle: room for end arrows when it has (or may get) ends. */
export function padFor(p: Puzzle, editing = false): number {
  return editing || p.endpoints.some((e) => e.kind === 'port') ? PORT_PAD : PAD;
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
  // With checkpoints, drawn lines are wider than the checkpoint discs.
  svg.classList.toggle('has-checkpoints', p.checkpoints.length > 0);

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
  /** One SVG path per continuous run of edges (closed runs are closed paths). */
  const strokes = (edges: Iterable<number>, cls: string): string =>
    edgeRuns(p, edges)
      .map(({ cells, closed }) => {
        const d = cells.map((c, i) => `${i ? 'L' : 'M'}${center(c).join(' ')}`).join('');
        return `<path class="${cls}" d="${d}${closed ? 'Z' : ''}"/>`;
      })
      .join('');

  const parts: string[] = [];
  const n = cellCount(p);
  const E = edgeCount(p);
  const ends = p.endpoints.slice(0, 2);
  const ports = ends.flatMap((e) => (e.kind === 'port' ? [e.port] : []));

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

  // Fixed ends: a path stub from the tile centre through the frame, with the
  // arrow's tail outside at the entrance and its head at the exit.
  if (ends.length) {
    parts.push('<g class="ends">');
    ends.forEach((end, i) => {
      const { x, y, d } = portPoint(end.port);
      parts.push(endMarker(center(portCell(p, end.port)), [x, y], d, i === 0 ? 'in' : 'out'));
    });
    parts.push('</g>');
  }

  if (o.ghost?.size) {
    parts.push('<g class="ghost">');
    parts.push(strokes(o.ghost, 'ghost-seg'));
    parts.push('</g>');
  }

  // Path segments. Each continuous run is one stroke with round joins, so
  // corners are seamless.
  const isErr = (e: number) => !!o.errorEdges?.has(e);
  const player = [...(o.segments ?? [])];
  parts.push('<g class="segments">');
  const isHi = (e: number) => !!o.highlight?.has(e);
  const ok = player.filter((e) => !isErr(e) && !isHi(e));
  const bad = player.filter(isErr);
  const hi = player.filter((e) => isHi(e) && !isErr(e));
  // Darker outlines first (all of them), then the fills, so outlines never
  // cut across a fill where runs meet.
  parts.push(strokes(ok, 'seg-edge'), strokes(bad, 'seg-edge error'), strokes(hi, 'seg-edge hint'));
  parts.push(strokes(ok, 'seg'), strokes(bad, 'seg error'), strokes(hi, 'seg hint'));
  parts.push('</g>');

  // Numbered checkpoints sit on top of the path.
  if (p.checkpoints.length) {
    parts.push('<g class="checkpoints">');
    p.checkpoints.forEach((cell, i) => {
      const [x, y] = center(cell);
      const label = String(i + 1);
      const cls = o.errorCells?.has(cell) ? 'cp-dot error' : 'cp-dot';
      const size = label.length > 2 ? 26 : label.length > 1 ? 32 : 38;
      parts.push(
        `<circle class="${cls}" cx="${x}" cy="${y}" r="31"/>` +
          `<text class="cp-num" x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${label}</text>`,
      );
    });
    parts.push('</g>');
  }

  // X marks.
  if (o.xMarks?.size) {
    parts.push('<g class="xmarks">');
    const s = 12;
    for (const e of o.xMarks) {
      const [x1, y1, x2, y2] = borderLine(e);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const cls = o.highlight?.has(e) ? 'xmark hint' : 'xmark';
      parts.push(line(cx - s, cy - s, cx + s, cy + s, cls), line(cx - s, cy + s, cx + s, cy - s, cls));
    }
    parts.push('</g>');
  }

  svg.innerHTML = parts.join('');
}

/**
 * Split a set of edges into runs of tiles: maximal chains through tiles that
 * have exactly two of the edges, plus closed loops. Branching tiles end runs.
 */
export function edgeRuns(p: Puzzle, edges: Iterable<number>): { cells: number[]; closed: boolean }[] {
  const byCell = new Map<number, number[]>();
  const list = [...edges];
  for (const e of list) {
    for (const c of edgeCells(p, e)) {
      const l = byCell.get(c);
      if (l) l.push(e);
      else byCell.set(c, [e]);
    }
  }
  const used = new Set<number>();
  const runs: { cells: number[]; closed: boolean }[] = [];
  const walk = (start: number, first: number) => {
    const cells = [start];
    let cur = start;
    let e = first;
    for (;;) {
      used.add(e);
      const [a, b] = edgeCells(p, e);
      cur = a === cur ? b : a;
      if (cur === start) return { cells, closed: true };
      cells.push(cur);
      const next = byCell.get(cur)!;
      if (next.length !== 2) return { cells, closed: false };
      const n = next[0] === e ? next[1] : next[0];
      if (used.has(n)) return { cells, closed: false };
      e = n;
    }
  };
  // Open runs start at tiles that are not simple pass-throughs.
  for (const [c, es] of byCell) {
    if (es.length === 2) continue;
    for (const e of es) if (!used.has(e)) runs.push(walk(c, e));
  }
  // Whatever is left forms closed loops.
  for (const e of list) {
    if (used.has(e)) continue;
    runs.push(walk(edgeCells(p, e)[0], e));
  }
  return runs;
}

/**
 * A frame end: one path-width stroke from the tile centre out through the
 * frame at border point b (outward direction d). Read as a single arrow
 * along the path: the entrance gets the arrow's tail (fletching) at the
 * stroke's outer tip, and the exit gets the arrowhead.
 */
function endMarker(c: [number, number], b: [number, number], d: [number, number], dir: 'in' | 'out'): string {
  const [dx, dy] = d;
  const at = (t: number, side = 0): string => `${b[0] + dx * t - dy * side},${b[1] + dy * t + dx * side}`;
  // Distances are measured outward from the frame.
  if (dir === 'in') {
    // Fletching: a notched chevron at the tip, its point toward the grid.
    const fins = [at(14), at(28, 24), at(56, 24), at(44), at(56, -24), at(28, -24)].join(' ');
    return `<path class="end-seg" d="M${c[0]} ${c[1]}L${at(34).replace(',', ' ')}"/><polygon class="end-head" points="${fins}"/>`;
  }
  const half = 29;
  return (
    `<path class="end-seg" d="M${c[0]} ${c[1]}L${at(26).replace(',', ' ')}"/>` +
    `<polygon class="end-head" points="${at(58)} ${at(24, half)} ${at(24, -half)}"/>`
  );
}
