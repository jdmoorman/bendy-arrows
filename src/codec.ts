import { cellCount, createPuzzle, edgeCount, MAX_SIZE, MIN_SIZE, modeOf, portCount, portEnd, type End, type Puzzle } from './model';

/**
 * Compact share code for a puzzle.
 *
 * Pre-release format versions are 0.x; the first byte holds the minor number.
 *   0.1  ends stored as tiles
 *   0.2  ends stored as frame ports
 *   0.3  each end is a tile or a frame port
 *   0.4  numbered checkpoints
 *   0.5  given segments removed (current; older codes' givens are ignored)
 *
 * Layout (0.5):
 *   byte 0      format minor version (5)
 *   byte 1      bit 0 = loop (informational), bits 1-2 = number of ends,
 *               bit 3 = checkpoints follow the ends
 *   byte 2, 3   width, height
 *   2 bytes per end, big-endian, entrance first:
 *               frame port index (0.3–0.4 codes could set the top bit for
 *               a tile end; those open as checkpoints)
 *   if bit 3:   2-byte checkpoint count, then 2 bytes per checkpoint tile (1 first)
 *   bitset: blocked cells, then walls (LSB first), padded to a byte
 *               (0.4 and earlier also had a givens bitset after the walls)
 * The bytes are base64url-encoded without padding.
 */

/** Current puzzle format version (pre-release). */
export const FORMAT_VERSION = '0.5';
const VERSION_BYTE = 5;
const CELL_FLAG = 0x8000;

export function encodePuzzle(p: Puzzle): string {
  const n = cellCount(p);
  const e = edgeCount(p);
  const endpoints = p.endpoints.slice(0, 2);
  const cps = p.checkpoints;
  const flags = (modeOf(p) === 'cycle' ? 1 : 0) | (endpoints.length << 1) | (cps.length ? 8 : 0);
  const header = [VERSION_BYTE, flags, p.w, p.h];
  for (const end of endpoints) {
    const v = end.port;
    header.push(v >> 8, v & 0xff);
  }
  if (cps.length) {
    header.push(cps.length >> 8, cps.length & 0xff);
    for (const c of cps) header.push(c >> 8, c & 0xff);
  }

  const bitCount = n + e;
  const bits = new Uint8Array(Math.ceil(bitCount / 8));
  const set = (i: number) => (bits[i >> 3] |= 1 << (i & 7));
  for (const c of p.blocked) set(c);
  for (const w of p.walls) set(n + w);

  const bytes = new Uint8Array(header.length + bits.length);
  bytes.set(header, 0);
  bytes.set(bits, header.length);
  return toBase64Url(bytes);
}

export function decodePuzzle(code: string): Puzzle {
  const bytes = fromBase64Url(code.trim());
  if (bytes.length < 4) throw new Error('Puzzle code is too short.');
  const version = bytes[0];
  if (version < 1 || version > VERSION_BYTE) throw new Error(`Unsupported puzzle format 0.${version}.`);
  const flags = bytes[1];
  const w = bytes[2];
  const h = bytes[3];
  checkSize(w, h);
  // The puzzle type follows from the ends, so the loop flag is not needed.
  const p = createPuzzle(w, h);
  const n = cellCount(p);
  const e = edgeCount(p);
  const nEnd = (flags >> 1) & 3;
  let off = 4;
  const legacyTiles: number[] = [];
  for (let i = 0; i < nEnd; i++) {
    const v = (bytes[off] << 8) | bytes[off + 1];
    off += 2;
    // 0.1 stored tiles, 0.2 ports, 0.3 either (flagged).
    const isCell = version === 1 || (version >= 3 && (v & CELL_FLAG) !== 0);
    const index = version >= 3 ? v & ~CELL_FLAG : v;
    if (isCell) {
      if (!(index < n)) throw new Error('Puzzle code has an end outside the grid.');
      legacyTiles.push(index);
    } else {
      if (!(index < portCount(p))) throw new Error('Puzzle code has an end outside the frame.');
      p.endpoints.push(portEnd(index));
    }
  }
  if (version >= 4 && flags & 8) {
    const count = (bytes[off] << 8) | bytes[off + 1];
    off += 2;
    for (let i = 0; i < count; i++) {
      const c = (bytes[off] << 8) | bytes[off + 1];
      off += 2;
      if (!(c < n)) throw new Error('Puzzle code has a checkpoint outside the grid.');
      p.checkpoints.push(c);
    }
  }
  // Formats before 0.5 also stored a givens bitset after the walls; it is ignored.
  adoptLegacyTileEnds(p, legacyTiles);
  const bitCount = n + (version < 5 ? 2 : 1) * e;
  if (bytes.length < off + Math.ceil(bitCount / 8)) throw new Error('Puzzle code is truncated.');
  const get = (i: number) => (bytes[off + (i >> 3)] >> (i & 7)) & 1;
  for (let i = 0; i < n; i++) if (get(i)) p.blocked.add(i);
  for (let i = 0; i < e; i++) if (get(n + i)) p.walls.add(i);
  return p;
}

export interface PuzzleJson {
  format: 'hamiltonian-puzzle';
  /** Format version, e.g. "0.2". */
  version: string;
  /** Informational: "path" when there are ends, else "cycle". Ignored on import. */
  mode: 'path' | 'cycle';
  width: number;
  height: number;
  blocked: number[];
  walls: number[];
  /**
   * Frame ends, entrance first: {"port": i}. (Format 0.1 files list tile
   * indices and 0.2 files list port indices as plain numbers; 0.3 files may
   * contain {"cell": i} tile ends, which open as checkpoints.)
   */
  endpoints: ({ cell: number } | { port: number })[];
  /** Checkpoint tiles in order (checkpoint 1 first). */
  checkpoints?: number[];
  code: string;
}

export function puzzleToJson(p: Puzzle): PuzzleJson {
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    format: 'hamiltonian-puzzle',
    version: FORMAT_VERSION,
    mode: modeOf(p),
    width: p.w,
    height: p.h,
    blocked: sorted(p.blocked),
    walls: sorted(p.walls),
    endpoints: p.endpoints.map((e) => ({ port: e.port })),
    checkpoints: [...p.checkpoints],
    code: encodePuzzle(p),
  };
}

export function puzzleFromJson(value: unknown): Puzzle {
  if (!value || typeof value !== 'object') throw new Error('Not a puzzle file.');
  const j = value as Partial<PuzzleJson>;
  if (j.format !== 'hamiltonian-puzzle') {
    if (typeof j.code === 'string') return decodePuzzle(j.code);
    throw new Error('Not a puzzle file.');
  }
  const w = Number(j.width);
  const h = Number(j.height);
  checkSize(w, h);
  const p = createPuzzle(w, h);
  const n = cellCount(p);
  const e = edgeCount(p);
  const ints = (xs: unknown, max: number, what: string): number[] => {
    if (xs === undefined) return [];
    if (!Array.isArray(xs)) throw new Error(`"${what}" must be a list.`);
    return xs.map((x) => {
      if (!Number.isInteger(x) || x < 0 || x >= max) throw new Error(`"${what}" contains an invalid index.`);
      return x as number;
    });
  };
  ints(j.blocked, n, 'blocked').forEach((c) => p.blocked.add(c));
  ints(j.walls, e, 'walls').forEach((x) => p.walls.add(x));
  const { ports, tiles } = parseEnds(j.endpoints, j.version, n, portCount(p));
  p.endpoints = ports.slice(0, 2);
  p.checkpoints = ints(j.checkpoints, n, 'checkpoints');
  adoptLegacyTileEnds(p, tiles);
  return p;
}

/**
 * Formats 0.1 and 0.3 allowed ends on tiles. Those are just checkpoints, so a
 * puzzle whose ends were all tiles gets them as checkpoints 1 and 2; tile ends
 * mixed with frame ends (or checkpoints) are dropped.
 */
function adoptLegacyTileEnds(p: Puzzle, tiles: number[]) {
  if (tiles.length && !p.endpoints.length && !p.checkpoints.length) p.checkpoints = tiles.slice(0, 2);
}

function parseEnds(xs: unknown, version: unknown, cells: number, ports: number): { ports: End[]; tiles: number[] } {
  const out = { ports: [] as End[], tiles: [] as number[] };
  if (xs === undefined) return out;
  if (!Array.isArray(xs)) throw new Error('"endpoints" must be a list.');
  const legacyCells = version === '0.1' || version === 1;
  const check = (i: unknown, max: number): number => {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= max) throw new Error('"endpoints" contains an invalid index.');
    return i as number;
  };
  for (const x of xs) {
    if (typeof x === 'number') {
      if (legacyCells) out.tiles.push(check(x, cells));
      else out.ports.push(portEnd(check(x, ports)));
    } else if (x && typeof x === 'object' && 'cell' in x) out.tiles.push(check((x as { cell: unknown }).cell, cells));
    else if (x && typeof x === 'object' && 'port' in x) out.ports.push(portEnd(check((x as { port: unknown }).port, ports)));
    else throw new Error('"endpoints" contains an invalid end.');
  }
  return out;
}

function checkSize(w: number, h: number) {
  const ok = (x: number) => Number.isInteger(x) && x >= MIN_SIZE && x <= MAX_SIZE;
  if (!ok(w) || !ok(h)) throw new Error(`Grid size must be between ${MIN_SIZE} and ${MAX_SIZE}.`);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(code)) throw new Error('Puzzle code contains invalid characters.');
  let b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
