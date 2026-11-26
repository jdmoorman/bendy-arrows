import { cellCount, cellRC, edgeCells, edgeCount, edgeTouchesBlocked, isHorizontalEdge, portCell, portSide, type Puzzle, type Side } from './model';

/** Size of one tile in SVG user units. */
export const CELL = 100;
/** A suggested fix's square on a tile: its inset from the tile's edge, side and corner radius. */
const FIX_INSET = CELL * 0.125;
const FIX_SIDE = CELL - 2 * FIX_INSET;
const FIX_RX = 14;
/** Space around the grid so the outer border and touches near it fit. */
export const PAD = 10;
/**
 * Space around the grid when end arrows are drawn outside the frame: the arrowhead's tip is 58
 * past the frame, and its outline 5 more.
 */
export const PORT_PAD = 64;
/** Extra space, outside everything else, for the column letters and row numbers. */
export const COORD_PAD = 44;

/** Whether boards show coordinates (a display setting shared by every view). */
let showCoordinates = false;
export function setShowCoordinates(on: boolean): void {
  showCoordinates = on;
}

/** Column letters: A … Z, then AA, AB, … (boards are at most 30 wide). */
export function columnName(c: number): string {
  return c < 26 ? String.fromCharCode(65 + c) : String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26));
}

export interface RenderOptions {
  segments?: Set<number>;
  /** The editor's desired solution: drawn like the logic helper's lines, merged with `segments`. */
  plan?: Set<number>;
  xMarks?: Set<number>;
  errorCells?: Set<number>;
  errorEdges?: Set<number>;
  /** Show the board as solved (the lines change colour). */
  solved?: boolean;
  /** Solved with a gold star: the lines turn gold instead. */
  gold?: boolean;
  /** A solution drawn faintly underneath (e.g. "show solution" in the editor). */
  ghost?: Set<number>;
  /** Draw faint markers on every border so editors can see where to tap. */
  showBorderTargets?: boolean;
  /** Draw faint markers on every frame border where an end could go. */
  showPortTargets?: boolean;
  /** For a puzzle short of ends: frame spots where an end gives a solution (only one, or several). */
  endOptions?: Map<number, 'unique' | 'multiple'>;
  /** Lines drawn faintly under the path: the rules' lines over the rest of a one-shot's board once its stroke stalls. */
  faint?: Set<number>;
  /** Tiles whose change alone (made black, or a black tile made open) gives a puzzle with no solution one: exactly one, or several. */
  tileFixes?: Map<number, 'unique' | 'multiple'>;
  /** Margin around the grid in SVG units (default PAD). */
  pad?: number;
  /** Tiles to shade in the highlight colour (e.g. the tile a hint is about). */
  focusCells?: Set<number>;
  /** The keyboard cursor's tile, outlined on top. */
  cursor?: number;
  /** Segments and X marks to draw in the highlight colour (e.g. the latest logic step). */
  highlight?: Set<number>;
  /** Column letters and row numbers around the board (the Coordinates setting by default). */
  coordinates?: boolean;
  /**
   * The letters and numbers sit right by the grid (under an end's arrow, if one comes out there),
   * and the margin beyond is cropped off. Not while editing, where an end can go anywhere.
   */
  tightCoordinates?: boolean;
  /** Borders to suggest walls on, drawn dashed on top; and walls to suggest taking away, in red. */
  suggestWalls?: number[];
  suggestClearWalls?: number[];
  /** Tiles to suggest blacking out, outlined dashed on top; and black tiles to suggest clearing, X'd. */
  suggestTiles?: number[];
  suggestClear?: number[];
  /** The puzzle's one end is its head (its tail was taken away), so it's drawn as one. */
  loneHead?: boolean;
  /** Ends (by port) a suggested fix moves elsewhere, X'd: green if a move gives one solution, amber if only several. */
  suggestMoveEnds?: Map<number, 'unique' | 'multiple'>;
  /** Walls and black tiles that could go without losing the unique solution, drawn in their own colour. */
  removable?: { walls: Set<number>; blocked: Set<number>; goal?: 'easy' | 'minimal' };
  /**
   * How far through the solve animation: pull (0 to 1), the head sliding back along the path to
   * the tail, taking it up; then spin (0 to 1), the short arrow left flying off the grid to the
   * middle of the board, turning and bending into a check mark. Only for a single open path;
   * anything else draws as usual.
   */
  retract?: { pull: number; spin: number };
}

/** Margin to use for a puzzle: room for end arrows when it has (or may get) ends. */
export function padFor(p: Puzzle, editing = false, coordinates = showCoordinates): number {
  const base = editing || p.endpoints.some((e) => e.kind === 'port') ? PORT_PAD : PAD;
  return base + (coordinates ? COORD_PAD : 0);
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
  const coords = (o.coordinates ?? showCoordinates) && pad >= COORD_PAD;
  // Tight coordinates: the margin past the labels, or past the arrows on a side an end comes out of.
  const tight = !!o.tightCoordinates && coords;
  const spare = (side: Side) =>
    !tight ? 0 : p.endpoints.some((e) => e.kind === 'port' && portSide(p, e.port)[0] === side) ? pad - PORT_PAD : pad - PAD - COORD_PAD;
  const top = spare('top');
  const left = spare('left');
  const right = spare('right');
  const bottom = spare('bottom');
  svg.setAttribute('viewBox', `${left} ${top} ${width - left - right} ${height - top - bottom}`);
  svg.dataset.pad = String(pad);
  svg.classList.toggle('solved', !!o.solved);
  svg.classList.toggle('gold', !!o.solved && !!o.gold);

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
    const cls = p.blocked.has(i)
      ? o.removable?.blocked.has(i)
        ? `tile blocked removable ${o.removable.goal ?? ''}`
        : 'tile blocked'
      : o.errorCells?.has(i)
        ? 'tile error'
        : o.focusCells?.has(i)
          ? 'tile focus'
          : (r + c) % 2
            ? 'tile alt'
            : 'tile';
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
      if (ports.includes(port) || p.blocked.has(portCell(p, port)) || o.endOptions?.has(port)) continue;
      const { x, y, d } = portPoint(port);
      parts.push(`<circle class="border-target" cx="${x + d[0] * 26}" cy="${y + d[1] * 26}" r="6"/>`);
    }
    parts.push('</g>');
  }

  if (o.endOptions?.size) {
    parts.push('<g class="end-options">');
    for (const [port, status] of o.endOptions) {
      if (ports.includes(port)) continue;
      const { x, y, d } = portPoint(port);
      parts.push(`<circle class="end-option ${status}" cx="${x + d[0] * 26}" cy="${y + d[1] * 26}" r="12"/>`);
    }
    parts.push('</g>');
  }

  if (o.tileFixes?.size) {
    // Dashes that land centred on each rounded corner: a whole number of dash-and-gap repeats
    // from corner to corner (dash to gap 14:10). A rect's outline starts on the top side, just
    // after the top-left corner's curve.
    const straight = FIX_SIDE - 2 * FIX_RX;
    const arc = (Math.PI * FIX_RX) / 2;
    const repeat = (straight + arc) / Math.max(1, Math.round((straight + arc) / 24));
    const dash = (repeat * 14) / 24;
    const offset = (((dash / 2 - straight - arc / 2) % repeat) + repeat) % repeat;
    const fixDashes = `stroke-dasharray:${dash.toFixed(2)} ${(repeat - dash).toFixed(2)};stroke-dashoffset:${offset.toFixed(2)}`;
    parts.push('<g class="tile-fixes">');
    for (const [cell, status] of o.tileFixes) {
      // A black tile to clear gets a red X instead (drawn on top, below).
      if (p.blocked.has(cell)) continue;
      const [r, c] = cellRC(p, cell);
      parts.push(`<rect class="tile-fix ${status}" style="${fixDashes}" x="${pad + c * CELL + FIX_INSET}" y="${pad + r * CELL + FIX_INSET}" width="${FIX_SIDE}" height="${FIX_SIDE}" rx="${FIX_RX}"/>`);
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
    parts.push(line(x1, y1, x2, y2, o.removable?.walls.has(e) ? `wall removable ${o.removable.goal ?? ''}` : 'wall'));
  }
  // Black tiles are outlined as if walled on every side, giving them rounded, bulging edges.
  for (const cell of p.blocked) {
    const [r, c] = cellRC(p, cell);
    const x0 = pad + c * CELL;
    const y0 = pad + r * CELL;
    const x1 = x0 + CELL;
    const y1 = y0 + CELL;
    const cls = o.removable?.blocked.has(cell) ? `wall removable ${o.removable.goal ?? ''}` : 'wall';
    parts.push(line(x0, y0, x1, y0, cls), line(x1, y0, x1, y1, cls), line(x1, y1, x0, y1, cls), line(x0, y1, x0, y0, cls));
  }
  parts.push('</g><g class="frame">');
  parts.push(`<rect class="outer" x="${pad}" y="${pad}" width="${p.w * CELL}" height="${p.h * CELL}" rx="4"/>`);
  parts.push('</g>');

  // Coordinates: letters above and below the columns, numbers either side of the rows. In the
  // outermost band of the margin, clear of end arrows; or, tight, right by the grid, under the
  // arrows (so drawn before them).
  if (coords) {
    const mid = COORD_PAD / 2;
    const near = PAD + mid;
    const at = (side: Side) =>
      tight
        ? side === 'top' || side === 'left' ? pad - near : (side === 'bottom' ? height : width) - pad + near
        : side === 'top' ? top + mid : side === 'left' ? left + mid : side === 'bottom' ? height - bottom - mid : width - right - mid;
    parts.push('<g class="coords">');
    for (let c = 0; c < p.w; c++) {
      const x = pad + (c + 0.5) * CELL;
      parts.push(`<text x="${x}" y="${at('top')}">${columnName(c)}</text>`, `<text x="${x}" y="${at('bottom')}">${columnName(c)}</text>`);
    }
    for (let r = 0; r < p.h; r++) {
      const y = pad + (r + 0.5) * CELL;
      parts.push(`<text x="${at('left')}" y="${y}">${r + 1}</text>`, `<text x="${at('right')}" y="${y}">${r + 1}</text>`);
    }
    parts.push('</g>');
  }

  const arrow = o.retract !== undefined && o.segments ? retractedArrow(p, o.segments, center, portPoint, o.retract, pad) : null;

  // Once the arrow's head and tail have met, the board fades to the solved colour with the spin.
  if (arrow?.tint) svg.style.setProperty('--celebrate', String(arrow.tint));
  else svg.style.removeProperty('--celebrate');

  // Fixed ends: a path stub from the tile centre through the frame, with the
  // arrow's tail outside at the entrance and its head at the exit.
  // Drawn like the line: outlines here, under the line's; fills over the line's (after it).
  const markers = arrow
    ? []
    : ends.map((end, i) => {
        const { x, y, d } = portPoint(end.port);
        return endMarker(center(portCell(p, end.port)), [x, y], d, i === 0 && !o.loneHead ? 'in' : 'out');
      });
  if (markers.length) parts.push('<g class="ends">', ...markers.map((m) => m.edge), '</g>');

  if (o.ghost?.size) {
    parts.push('<g class="ghost">');
    parts.push(strokes(o.ghost, 'ghost-seg'));
    parts.push('</g>');
  }

  // Path segments. Each continuous run is one stroke with round joins, so
  // corners are seamless.
  const isErr = (e: number) => !!o.errorEdges?.has(e);
  // The editor's desired solution is drawn just like the logic helper's lines, as one set with them.
  const player = arrow ? [] : [...new Set([...(o.segments ?? []), ...(o.plan ?? [])])];
  if (o.faint?.size) parts.push('<g class="faint">', strokes([...o.faint], 'seg faint'), '</g>');
  // X marks: over the lines, but under the solve animation's arrow, which flies over them.
  let xmarks = '';
  if (o.xMarks?.size) {
    const s = 12;
    const marks = [...o.xMarks].map((e) => {
      const [x1, y1, x2, y2] = borderLine(e);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const cls = o.highlight?.has(e) ? 'xmark hint' : o.errorEdges?.has(e) ? 'xmark error' : 'xmark';
      return line(cx - s, cy - s, cx + s, cy + s, cls) + line(cx - s, cy + s, cx + s, cy - s, cls);
    });
    xmarks = `<g class="xmarks">${marks.join('')}</g>`;
  }
  if (arrow) parts.push(xmarks);
  parts.push('<g class="segments">');
  if (arrow) parts.push(arrow.body);
  const isHi = (e: number) => !!o.highlight?.has(e);
  const ok = player.filter((e) => !isErr(e) && !isHi(e));
  const bad = player.filter(isErr);
  const hi = player.filter((e) => isHi(e) && !isErr(e));
  // Darker outlines first (all of them), then the fills, so outlines never
  // cut across a fill where runs meet.
  parts.push(strokes(ok, 'seg-edge'), strokes(bad, 'seg-edge error'), strokes(hi, 'seg-edge hint'));
  parts.push(strokes(ok, 'seg'), strokes(bad, 'seg error'), strokes(hi, 'seg hint'));
  parts.push('</g>');

  if (markers.length) parts.push('<g class="ends">', ...markers.map((m) => m.fill), '</g>');

  if (!arrow) parts.push(xmarks);


  for (const e of o.suggestWalls ?? []) {
    const [x1, y1, x2, y2] = borderLine(e);
    parts.push(line(x1, y1, x2, y2, 'wall suggest'));
  }
  for (const e of o.suggestClearWalls ?? []) {
    const [x1, y1, x2, y2] = borderLine(e);
    parts.push(line(x1, y1, x2, y2, 'wall suggest clear'));
  }
  // Black tiles to clear and ends to move: a bold X over each. A fix's X is green if it gives
  // one solution, amber if several; Suggest's is red.
  const deleteX = (cx: number, cy: number, s: number, cls: string) => {
    // Dashes sized to fit each stroke exactly: one at each tip, and (an odd count) one through
    // the middle, where the strokes cross. Dash to gap is 1:2, dashes about 6 long.
    const len = 2 * Math.SQRT2 * s;
    const n = 2 * Math.max(1, Math.round(((len / 6 + 2) / 3 - 1) / 2)) + 1;
    const dash = len / (3 * n - 2);
    const style = `stroke-dasharray:${dash.toFixed(2)} ${(2 * dash).toFixed(2)}`;
    const stroke = (x1: number, y1: number, x2: number, y2: number) =>
      `<line class="delete-x ${cls}" style="${style}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    return stroke(cx - s, cy - s, cx + s, cy + s) + stroke(cx - s, cy + s, cx + s, cy - s);
  };
  const tileX = (cell: number, cls: string) => {
    const [r, c] = cellRC(p, cell);
    parts.push(deleteX(pad + c * CELL + CELL / 2, pad + r * CELL + CELL / 2, CELL * 0.26, cls));
  };
  for (const cell of o.suggestClear ?? []) tileX(cell, 'suggest');
  for (const [cell, status] of o.tileFixes ?? []) if (p.blocked.has(cell)) tileX(cell, status);
  for (const [port, status] of o.suggestMoveEnds ?? []) {
    const { x, y, d } = portPoint(port);
    parts.push(deleteX(x + d[0] * 26, y + d[1] * 26, CELL * 0.26, status));
  }
  for (const cell of o.suggestTiles ?? []) {
    const [r, c] = cellRC(p, cell);
    const inset = CELL * 0.12;
    parts.push(`<rect class="tile-suggest" x="${pad + c * CELL + inset}" y="${pad + r * CELL + inset}" width="${CELL - 2 * inset}" height="${CELL - 2 * inset}" rx="8"/>`);
  }

  if (o.cursor !== undefined) {
    const [r, c] = cellRC(p, o.cursor);
    const inset = CELL * 0.06;
    parts.push(`<rect class="cursor" x="${pad + c * CELL + inset}" y="${pad + r * CELL + inset}" width="${CELL - 2 * inset}" height="${CELL - 2 * inset}" rx="10"/>`);
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

type Pt = [number, number];

/** What's left of the arrow once head and tail have pulled in: an L about one of the path's corners. */
const HEAD_ARM = 90;
const TAIL_ARM = 40;

/**
 * The solved path drawn as one arrow partway through the solve animation (see
 * RenderOptions.retract): its head pulled back toward the tail by pull, then what's left flown
 * to the middle of the board, turned and bent into a check mark by spin. Gives the stretch
 * showing (frame stubs and the path between) and the fletching and head at its ends. Null
 * unless the lines make one open path.
 */
function retractedArrow(
  p: Puzzle,
  segments: Set<number>,
  center: (cell: number) => Pt,
  portPoint: (port: number) => { x: number; y: number; d: [number, number] },
  { pull, spin }: { pull: number; spin: number },
  pad: number,
): { body: string; tint: number } | null {
  const runs = edgeRuns(p, segments);
  if (runs.length !== 1 || runs[0].closed) return null;
  let cells = runs[0].cells;
  const [tail, head] = p.endpoints.slice(0, 2).map((e) => portCell(p, e.port));
  if ((tail !== undefined && tail === cells[cells.length - 1] && tail !== cells[0]) || (head !== undefined && head === cells[0])) {
    cells = [...cells].reverse();
  }
  // The arrow's whole length: tail stub's tip, the tile centres, head stub's tip.
  const pts: Pt[] = cells.map(center);
  const tailStub = tail !== undefined && tail === cells[0];
  const headStub = head !== undefined && head === cells[cells.length - 1];
  if (tailStub) {
    const { x, y, d } = portPoint(p.endpoints[0].port);
    pts.unshift([x + d[0] * 34, y + d[1] * 34]);
  }
  if (headStub) {
    const { x, y, d } = portPoint(p.endpoints[1].port);
    pts.push([x + d[0] * 26, y + d[1] * 26]);
  }
  const at: number[] = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = at[at.length - 1];
  const lastSeg = pts.length - 2;
  const segOf = (s: number) => {
    for (let i = 0; i < lastSeg; i++) if (s < at[i + 1]) return i;
    return lastSeg;
  };
  const pathAt = (s: number): Pt => {
    const i = segOf(s);
    const f = at[i + 1] > at[i] ? (s - at[i]) / (at[i + 1] - at[i]) : 0;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  };

  // The check: a short stroke down to the right, then a long one up to the right, in the middle
  // of the board (nudged left and down, as the arrowhead sticks out up to the right). It looks
  // the same on every board: as on a 3×3 one, grown with the board, its line as thick.
  const long = Math.max(130, Math.min(p.w, p.h) * CELL * 0.5);
  const grow = long / 150;
  const short = long * 0.45;
  const down: Pt = [Math.SQRT1_2, Math.SQRT1_2];
  const up: Pt = [Math.cos(-0.96), Math.sin(-0.96)];
  const a0: Pt = [0, 0];
  const v0: Pt = [down[0] * short, down[1] * short];
  const e0: Pt = [v0[0] + up[0] * long, v0[1] + up[1] * long];
  const cx = pad + (p.w * CELL) / 2 - (Math.min(a0[0], e0[0]) + Math.max(a0[0], e0[0])) / 2 - 10 * grow;
  const cy = pad + (p.h * CELL) / 2 - (Math.min(a0[1], e0[1]) + v0[1]) / 2 + 12 * grow;
  const A: Pt = [a0[0] + cx, a0[1] + cy];
  const V: Pt = [v0[0] + cx, v0[1] + cy];
  const E: Pt = [e0[0] + cx, e0[1] + cy];
  const corner = short / (short + long);
  const checkAt = (f: number): Pt =>
    f <= corner
      ? [A[0] + (V[0] - A[0]) * (f / corner), A[1] + (V[1] - A[1]) * (f / corner)]
      : [V[0] + (E[0] - V[0]) * ((f - corner) / (1 - corner)), V[1] + (E[1] - V[1]) * ((f - corner) / (1 - corner))];

  // Head and tail pull in together on one of the path's corners, which becomes the check's
  // corner: one bending the check's way if there is one (else any), the nearest the middle of the
  // path; with no corner, the middle.
  const cross = (i: number) =>
    (pts[i][0] - pts[i - 1][0]) * (pts[i + 1][1] - pts[i][1]) - (pts[i][1] - pts[i - 1][1]) * (pts[i + 1][0] - pts[i][0]);
  const checkWay = Math.sign(down[0] * up[1] - down[1] * up[0]);
  let pivot = -1;
  let best = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = Math.sign(cross(i));
    if (!c) continue;
    const score = Math.abs(at[i] - total / 2) + (c === checkWay ? 0 : 1e6);
    if (score < best) [pivot, best] = [i, score];
  }
  const mid = pivot >= 0 ? at[pivot] : total / 2;
  const k = Math.max(0, Math.min(1, pull));
  const from = k * Math.max(0, mid - TAIL_ARM);
  const to = total - k * Math.max(0, total - mid - HEAD_ARM);
  const span = to - from || 1;
  const bend = Math.max(0, Math.min(1, spin));
  const met = pull >= 1;
  // Points along the stretch showing: the path's corners, the check's, and evenly in between.
  const fs = new Set<number>([corner]);
  for (let i = 0; i <= 40; i++) fs.add(i / 40);
  for (const s of at) if (s > from && s < to) fs.add((s - from) / span);
  // Along the check, the pivot corner lands on its corner.
  const pc = Math.max(1e-6, Math.min(1 - 1e-6, (mid - from) / span));
  const toCheck = (f: number) => (f <= pc ? (f / pc) * corner : corner + ((f - pc) / (1 - pc)) * (1 - corner));
  fs.add(pc);
  const fracs = [...fs].sort((x, y) => x - y);
  // Then it flies from where it is to the middle, growing into the check about its own centre
  // and turning a full turn as it goes.
  const mean = (at: (f: number) => Pt): Pt => {
    let x = 0;
    let y = 0;
    for (let i = 0; i <= 40; i++) {
      const q = at(i / 40);
      x += q[0] / 41;
      y += q[1] / 41;
    }
    return [x, y];
  };
  const c0 = bend ? mean((f) => pathAt(from + f * span)) : ([0, 0] as Pt);
  const c1 = bend ? mean((f) => checkAt(toCheck(f))) : ([0, 0] as Pt);
  // It always turns anticlockwise: with y down, a negative angle. Between the L's way and the
  // check's (under half a turn either way) and the full turn, that's one to one and a half turns.
  const turn = -1;
  // The shape changes with the L turned to lie as the check does (its head's arm along the
  // check's), so the corner keeps its bend; the whole then turns from the L's way to the check's,
  // plus the full turn.
  const armAt = pivot >= 0 ? pivot : segOf(mid);
  const arm = Math.atan2(pts[armAt + 1][1] - pts[armAt][1], pts[armAt + 1][0] - pts[armAt][0]);
  let align = Math.atan2(up[1], up[0]) - arm;
  align = Math.atan2(Math.sin(align), Math.cos(align));
  const angle = -(1 - bend) * (align + turn * 2 * Math.PI);
  const [ac, as] = [Math.cos(align), Math.sin(align)];
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const place = (f: number): Pt => {
    const q = pathAt(from + f * span);
    if (!bend) return q;
    const c = checkAt(toCheck(f));
    const [qx, qy] = [q[0] - c0[0], q[1] - c0[1]];
    const rx = (qx * ac - qy * as) * (1 - bend) + (c[0] - c1[0]) * bend;
    const ry = (qx * as + qy * ac) * (1 - bend) + (c[1] - c1[1]) * bend;
    return [c0[0] + (c1[0] - c0[0]) * bend + rx * cos - ry * sin, c0[1] + (c1[1] - c0[1]) * bend + rx * sin + ry * cos];
  };
  const placed = fracs.map(place);

  const body = placed.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join('');

  /** Points at offsets (forward, sideways) from o, facing from a to b. */
  const shape = (o: Pt, a: Pt, b: Pt, offsets: [number, number][]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    return offsets.map(([f, side]) => `${o[0] + ux * f - uy * side},${o[1] + uy * f + ux * side}`).join(' ');
  };
  // The line, head and tail thicken as it grows into the check (widths as in style.css).
  const w = 1 + (grow - 1) * bend;
  const width = (base: number) => (w === 1 ? '' : ` style="stroke-width:${base * w}"`);
  const scaled = (offsets: [number, number][]) => offsets.map(([f, side]): [number, number] => [f * w, side * w]);
  const n = placed.length;
  const ends: string[] = [];
  if (tailStub) ends.push(shape(placed[0], placed[0], placed[1], scaled([[20, 0], [6, 24], [-22, 24], [-10, 0], [-22, -24], [6, -24]])));
  if (headStub) ends.push(shape(placed[n - 1], placed[n - 2], placed[n - 1], scaled([[32, 0], [-2, 29], [-2, -29]])));
  // The ends are drawn like the line, outlined like it (all the outlines first, so none cuts
  // across a fill).
  const poly = (cls: string, base: number) => ends.map((pts) => `<polygon class="${cls}" points="${pts}"${width(base)}/>`).join('');
  return {
    body:
      (body ? `<path class="seg-edge" d="${body}"${width(28)}/>` : '') +
      poly('head-edge', 10) +
      (body ? `<path class="seg" d="${body}"${width(22)}/>` : '') +
      poly('head-fill', 4),
    tint: met ? bend : 0,
  };
}

/**
 * A frame end: one path-width stroke from the tile centre out through the
 * frame at border point b (outward direction d). Read as a single arrow
 * along the path: the entrance gets the arrow's tail (fletching) at the
 * stroke's outer tip, and the exit gets the arrowhead.
 */
function endMarker(c: [number, number], b: [number, number], d: [number, number], dir: 'in' | 'out'): { edge: string; fill: string } {
  const [dx, dy] = d;
  const at = (t: number, side = 0): string => `${b[0] + dx * t - dy * side},${b[1] + dy * t + dx * side}`;
  // Distances are measured outward from the frame. The entrance's fletching is a notched chevron
  // at the tip, its point toward the grid.
  const stub = `M${c[0]} ${c[1]}L${at(dir === 'in' ? 34 : 26).replace(',', ' ')}`;
  const head =
    dir === 'in'
      ? [at(14), at(28, 24), at(56, 24), at(44), at(56, -24), at(28, -24)].join(' ')
      : `${at(58)} ${at(24, 29)} ${at(24, -29)}`;
  return {
    edge: `<path class="seg-edge" d="${stub}"/><polygon class="head-edge" points="${head}"/>`,
    fill: `<path class="seg" d="${stub}"/><polygon class="head-fill" points="${head}"/>`,
  };
}
