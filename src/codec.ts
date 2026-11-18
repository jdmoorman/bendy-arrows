import { cellCount, createPuzzle, edgeCount, MAX_SIZE, MIN_SIZE, portCount, portEnd, type End, type Puzzle } from './model';

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
 * Numbered checkpoints (and tile ends, which opened as checkpoints) are no
 * longer supported: codes with them are refused with NumbersNotSupported.
 *
 * Layout (0.5):
 *   byte 0      format minor version (5)
 *   byte 1      bit 0 unused, bits 1-2 = number of ends,
 *               bit 3 = checkpoints follow the ends (refused)
 *   byte 2, 3   width, height
 *   2 bytes per end, big-endian, entrance first: frame port index
 *               (0.3–0.4 codes could set the top bit for a tile end: refused)
 *   bitset: blocked cells, then walls (LSB first), padded to a byte
 *               (0.4 and earlier also had a givens bitset after the walls)
 * The bytes are base64url-encoded without padding.
 */

/** Current puzzle format version (pre-release). */
export const FORMAT_VERSION = '0.5';
const VERSION_BYTE = 5;
const CELL_FLAG = 0x8000;

/** A code or file from when puzzles could have numbered checkpoints, which are gone. */
export class NumbersNotSupported extends Error {
  constructor() {
    super('Puzzles with numbers are no longer supported.');
    this.name = 'NumbersNotSupported';
  }
}

export function encodePuzzle(p: Puzzle): string {
  const n = cellCount(p);
  const e = edgeCount(p);
  const endpoints = p.endpoints.slice(0, 2);
  const header = [VERSION_BYTE, endpoints.length << 1, p.w, p.h];
  for (const end of endpoints) header.push(end.port >> 8, end.port & 0xff);

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
  const p = createPuzzle(w, h);
  const n = cellCount(p);
  const e = edgeCount(p);
  const nEnd = (flags >> 1) & 3;
  if (version >= 4 && flags & 8) throw new NumbersNotSupported();
  let off = 4;
  for (let i = 0; i < nEnd; i++) {
    const v = (bytes[off] << 8) | bytes[off + 1];
    off += 2;
    // 0.1 stored ends as tiles, and 0.3–0.4 could flag a tile end: both opened as numbers.
    if (version === 1 || (version >= 3 && (v & CELL_FLAG) !== 0)) throw new NumbersNotSupported();
    if (!(v < portCount(p))) throw new Error('Puzzle code has an end outside the frame.');
    p.endpoints.push(portEnd(v));
  }
  // Formats before 0.5 also stored a givens bitset after the walls; it is ignored.
  const bitCount = n + (version < 5 ? 2 : 1) * e;
  if (bytes.length < off + Math.ceil(bitCount / 8)) throw new Error('Puzzle code is truncated.');
  const get = (i: number) => (bytes[off + (i >> 3)] >> (i & 7)) & 1;
  for (let i = 0; i < n; i++) if (get(i)) p.blocked.add(i);
  for (let i = 0; i < e; i++) if (get(n + i)) p.walls.add(i);
  return p;
}

export interface PuzzleJson {
  format: 'bendy-arrows-puzzle';
  /** Format version, e.g. "0.2". */
  version: string;
  width: number;
  height: number;
  blocked: number[];
  walls: number[];
  /**
   * Frame ends, entrance first: {"port": i}. (0.2 files list port indices as
   * plain numbers. Tile ends, from 0.1 and 0.3 files, and the "checkpoints" of
   * 0.4 files are numbers, which are refused.)
   */
  endpoints: { port: number }[];
  code: string;
}

export function puzzleToJson(p: Puzzle): PuzzleJson {
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    format: 'bendy-arrows-puzzle',
    version: FORMAT_VERSION,
    width: p.w,
    height: p.h,
    blocked: sorted(p.blocked),
    walls: sorted(p.walls),
    endpoints: p.endpoints.map((e) => ({ port: e.port })),
    code: encodePuzzle(p),
  };
}

export function puzzleFromJson(value: unknown): Puzzle {
  if (!value || typeof value !== 'object') throw new Error('Not a puzzle file.');
  const j = value as Partial<PuzzleJson>;
  // Files from before the rename say 'hamiltonian-puzzle'.
  if (j.format !== 'bendy-arrows-puzzle' && (j.format as unknown) !== 'hamiltonian-puzzle') {
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
  const old = j as { checkpoints?: unknown };
  if (Array.isArray(old.checkpoints) && old.checkpoints.length) throw new NumbersNotSupported();
  p.endpoints = parseEnds(j.endpoints, j.version, portCount(p)).slice(0, 2);
  return p;
}

function parseEnds(xs: unknown, version: unknown, ports: number): End[] {
  if (xs === undefined) return [];
  if (!Array.isArray(xs)) throw new Error('"endpoints" must be a list.');
  const port = (i: unknown): End => {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= ports) throw new Error('"endpoints" contains an invalid index.');
    return portEnd(i as number);
  };
  return xs.map((x) => {
    // 0.1 files listed tiles as plain numbers, and 0.3 files could have {"cell": i}: numbers now.
    if ((typeof x === 'number' && (version === '0.1' || version === 1)) || (x && typeof x === 'object' && 'cell' in x)) throw new NumbersNotSupported();
    if (typeof x === 'number') return port(x);
    if (x && typeof x === 'object' && 'port' in x) return port((x as { port: unknown }).port);
    throw new Error('"endpoints" contains an invalid end.');
  });
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
