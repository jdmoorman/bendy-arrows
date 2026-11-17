import { cellCount, createPuzzle, edgeCount, MAX_SIZE, MIN_SIZE, type Puzzle } from './model';

/**
 * Compact share code for a puzzle.
 *
 * Layout (version 1):
 *   byte 0      version
 *   byte 1      bit 0 = cycle mode, bits 1-2 = number of endpoints
 *   byte 2, 3   width, height
 *   2 bytes per endpoint (big-endian cell index)
 *   bitset: blocked cells, then walls, then givens (LSB first), padded to a byte
 * The bytes are base64url-encoded without padding.
 */

const VERSION = 1;

export function encodePuzzle(p: Puzzle): string {
  const n = cellCount(p);
  const e = edgeCount(p);
  const endpoints = p.mode === 'path' ? p.endpoints.slice(0, 2) : [];
  const header = [VERSION, (p.mode === 'cycle' ? 1 : 0) | (endpoints.length << 1), p.w, p.h];
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
  if (bytes[0] !== VERSION) throw new Error(`Unsupported puzzle code version ${bytes[0]}.`);
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
    const c = (bytes[off] << 8) | bytes[off + 1];
    off += 2;
    if (!(c < n)) throw new Error('Puzzle code has an endpoint outside the grid.');
    p.endpoints.push(c);
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
  version: number;
  mode: 'path' | 'cycle';
  width: number;
  height: number;
  blocked: number[];
  walls: number[];
  givens: number[];
  endpoints: number[];
  code: string;
}

export function puzzleToJson(p: Puzzle): PuzzleJson {
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    format: 'hamiltonian-puzzle',
    version: VERSION,
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
  if (p.mode === 'path') p.endpoints = ints(j.endpoints, n, 'endpoints').slice(0, 2);
  return p;
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
