import { cellCount, cellRC, createPuzzle, edgeCount, MAX_SIZE, MIN_SIZE, portCount, portId, type Puzzle, type Size } from './model';

/**
 * Compact share code for a puzzle.
 *
 * Pre-release format versions are 0.x; the first byte holds the minor number.
 *   0.1  ends stored as tiles
 *   0.2  ends stored as frame ports (current)
 *
 * Layout (0.2):
 *   byte 0      format minor version (2)
 *   byte 1      bit 0 = cycle mode, bits 1-2 = number of end ports
 *   byte 2, 3   width, height
 *   2 bytes per end port (big-endian port index; entrance first)
 *   bitset: blocked cells, then walls, then givens (LSB first), padded to a byte
 * The bytes are base64url-encoded without padding.
 */

/** Current puzzle format version (pre-release). */
export const FORMAT_VERSION = '0.2';
const VERSION_BYTE = 2;

/**
 * Format 0.1 stored ends as tiles. Convert a boundary tile to a port on its
 * outer border (interior tiles have none and are dropped).
 */
function legacyCellToPort(s: Size, cell: number): number {
  const [r, c] = cellRC(s, cell);
  if (r === 0) return portId(s, 'top', c);
  if (c === s.w - 1) return portId(s, 'right', r);
  if (r === s.h - 1) return portId(s, 'bottom', c);
  if (c === 0) return portId(s, 'left', r);
  return -1;
}

export function encodePuzzle(p: Puzzle): string {
  const n = cellCount(p);
  const e = edgeCount(p);
  const endpoints = p.mode === 'path' ? p.endpoints.slice(0, 2) : [];
  const header = [VERSION_BYTE, (p.mode === 'cycle' ? 1 : 0) | (endpoints.length << 1), p.w, p.h];
  for (const c of endpoints) header.push(c >> 8, c & 0xff);

  const bitCount = n + 2 * e;
  const bits = new Uint8Array(Math.ceil(bitCount / 8));
  const set = (i: number) => (bits[i >> 3] |= 1 << (i & 7));
  for (const c of p.blocked) set(c);
  for (const w of p.walls) set(n + w);
  for (const g of p.givens) set(n + e + g);

  const bytes = new Uint8Array(header.length + bits.length);
  bytes.set(header, 0);
  bytes.set(bits, header.length);
  return toBase64Url(bytes);
}

export function decodePuzzle(code: string): Puzzle {
  const bytes = fromBase64Url(code.trim());
  if (bytes.length < 4) throw new Error('Puzzle code is too short.');
  const version = bytes[0];
  if (version !== 1 && version !== 2) throw new Error(`Unsupported puzzle format 0.${version}.`);
  const flags = bytes[1];
  const w = bytes[2];
  const h = bytes[3];
  checkSize(w, h);
  const p = createPuzzle(w, h, flags & 1 ? 'cycle' : 'path');
  const n = cellCount(p);
  const e = edgeCount(p);
  const nEnd = (flags >> 1) & 3;
  let off = 4;
  for (let i = 0; i < nEnd; i++) {
    const v = (bytes[off] << 8) | bytes[off + 1];
    off += 2;
    if (version === 1) { // format 0.1: a tile
      if (!(v < n)) throw new Error('Puzzle code has an end outside the grid.');
      const port = legacyCellToPort(p, v);
      if (port >= 0) p.endpoints.push(port);
    } else {
      if (!(v < portCount(p))) throw new Error('Puzzle code has an end outside the frame.');
      p.endpoints.push(v);
    }
  }
  const bitCount = n + 2 * e;
  if (bytes.length < off + Math.ceil(bitCount / 8)) throw new Error('Puzzle code is truncated.');
  const get = (i: number) => (bytes[off + (i >> 3)] >> (i & 7)) & 1;
  for (let i = 0; i < n; i++) if (get(i)) p.blocked.add(i);
  for (let i = 0; i < e; i++) if (get(n + i)) p.walls.add(i);
  for (let i = 0; i < e; i++) if (get(n + e + i)) p.givens.add(i);
  return p;
}

export interface PuzzleJson {
  format: 'hamiltonian-puzzle';
  /** Format version, e.g. "0.2". */
  version: string;
  mode: 'path' | 'cycle';
  width: number;
  height: number;
  blocked: number[];
  walls: number[];
  givens: number[];
  /** End ports, entrance first (format 0.1 stored tiles instead). */
  endpoints: number[];
  code: string;
}

export function puzzleToJson(p: Puzzle): PuzzleJson {
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    format: 'hamiltonian-puzzle',
    version: FORMAT_VERSION,
    mode: p.mode,
    width: p.w,
    height: p.h,
    blocked: sorted(p.blocked),
    walls: sorted(p.walls),
    givens: sorted(p.givens),
    endpoints: p.mode === 'path' ? [...p.endpoints] : [],
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
  const p = createPuzzle(w, h, j.mode === 'cycle' ? 'cycle' : 'path');
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
  ints(j.givens, e, 'givens').forEach((x) => p.givens.add(x));
  if (p.mode === 'path') {
    p.endpoints =
      isLegacy(j.version)
        ? ints(j.endpoints, n, 'endpoints').map((c) => legacyCellToPort(p, c)).filter((x) => x >= 0).slice(0, 2)
        : ints(j.endpoints, portCount(p), 'endpoints').slice(0, 2);
  }
  return p;
}

/** Format 0.1 (also written as the number 1 by early builds). */
function isLegacy(v: unknown): boolean {
  return v === '0.1' || v === 1;
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
