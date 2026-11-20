import { cellCount, createPuzzle, edgeCount, isOneShot, MAX_SIZE, MIN_SIZE, portCount, portEnd, type Puzzle } from './model';

/**
 * Compact share code for a puzzle.
 *
 * Pre-release format versions are 0.x; the first byte holds the minor number. Only the
 * current one, 0.6, is read: older codes (0.1–0.5) were converted and are no longer opened.
 *
 * Layout (0.6): byte 0 is the version (6), then a bit stream, most significant bit first:
 *   5 bits each   width - 1, height - 1
 *   2 bits        number of ends; 3 means two ends and a one-shot puzzle
 *   per end       frame port index, in just enough bits for the board's port count
 *   3 bits        Rice parameter k
 *   Elias gamma   number of obstacles + 1
 *   per obstacle  gap since the previous one, Rice-coded with k (a run of 1s for
 *                 gap >> k, a 0, then the low k bits), over one index space: black
 *                 tiles first, then walls
 *   padded with 0s to a byte. The bytes are base64url-encoded without padding.
 */

/** Current puzzle format version (pre-release). */
export const FORMAT_VERSION = '0.6';
const VERSION_BYTE = 6;

export function encodePuzzle(p: Puzzle): string {
  const n = cellCount(p);
  const positions = [...[...p.blocked].sort((x, y) => x - y), ...[...p.walls].sort((x, y) => x - y).map((w) => n + w)];
  const gaps = positions.map((pos, i) => pos - (i ? positions[i - 1] : -1) - 1);
  // The Rice parameter that gives the fewest bits.
  let k = 0;
  let bestBits = Infinity;
  for (let t = 0; t < 8; t++) {
    const bits = gaps.reduce((sum, g) => sum + (g >> t) + 1 + t, 0);
    if (bits < bestBits) [k, bestBits] = [t, bits];
  }
  const out = new BitWriter();
  out.write(p.w - 1, 5);
  out.write(p.h - 1, 5);
  const endpoints = p.endpoints.slice(0, 2);
  out.write(endpoints.length === 2 && p.oneShot ? 3 : endpoints.length, 2);
  const portBits = bitsFor(portCount(p));
  for (const end of endpoints) out.write(end.port, portBits);
  out.write(k, 3);
  out.gamma(positions.length + 1);
  for (const g of gaps) {
    for (let q = g >> k; q > 0; q--) out.write(1, 1);
    out.write(0, 1);
    out.write(g & ((1 << k) - 1), k);
  }
  return toBase64Url(new Uint8Array([VERSION_BYTE, ...out.bytes()]));
}

export function decodePuzzle(code: string): Puzzle {
  const bytes = fromBase64Url(code.trim());
  if (!bytes.length) throw new Error('Puzzle code is too short.');
  if (bytes[0] !== VERSION_BYTE) throw new Error(`Unsupported puzzle format 0.${bytes[0]}.`);
  return decodePacked(bytes);
}

/** Decode a 0.6 code (the version byte has been checked). */
function decodePacked(bytes: Uint8Array): Puzzle {
  const r = new BitReader(bytes, 1);
  const w = r.read(5) + 1;
  const h = r.read(5) + 1;
  checkSize(w, h);
  const p = createPuzzle(w, h);
  const n = cellCount(p);
  const total = n + edgeCount(p);
  let nEnd = r.read(2);
  if (nEnd === 3) {
    p.oneShot = true;
    nEnd = 2;
  }
  const portBits = bitsFor(portCount(p));
  for (let i = 0; i < nEnd; i++) {
    const v = r.read(portBits);
    if (!(v < portCount(p))) throw new Error('Puzzle code has an end outside the frame.');
    p.endpoints.push(portEnd(v));
  }
  const k = r.read(3);
  const count = r.gamma() - 1;
  if (count > total) throw new Error('Puzzle code has too many obstacles.');
  let pos = -1;
  for (let i = 0; i < count; i++) {
    let q = 0;
    while (r.read(1)) if (++q > total) throw new Error('Puzzle code is corrupt.');
    pos += ((q << k) | r.read(k)) + 1;
    if (pos >= total) throw new Error('Puzzle code has an obstacle outside the board.');
    if (pos < n) p.blocked.add(pos);
    else p.walls.add(pos - n);
  }
  return p;
}

/** Bits needed to store any number below `count`. */
function bitsFor(count: number): number {
  return Math.max(1, Math.ceil(Math.log2(count)));
}

class BitWriter {
  private bits: number[] = [];
  write(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  /** Elias gamma code of a positive number: its bit length - 1 as 0s, then the number. */
  gamma(value: number): void {
    const width = Math.floor(Math.log2(value)) + 1;
    this.write(0, width - 1);
    this.write(value, width);
  }
  bytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] ?? 0);
      out.push(b);
    }
    return out;
  }
}

class BitReader {
  private pos: number;
  constructor(private data: Uint8Array, startByte: number) {
    this.pos = startByte * 8;
  }
  read(width: number): number {
    let v = 0;
    for (let i = 0; i < width; i++, this.pos++) {
      if (this.pos >= this.data.length * 8) throw new Error('Puzzle code is truncated.');
      v = (v << 1) | ((this.data[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
    }
    return v;
  }
  gamma(): number {
    let zeros = 0;
    while (!this.read(1)) if (++zeros > 30) throw new Error('Puzzle code is corrupt.');
    return ((1 << zeros) | this.read(zeros)) >>> 0;
  }
}

export interface PuzzleJson {
  format: 'bendy-arrows-puzzle';
  /** Format version, e.g. "0.6". */
  version: string;
  width: number;
  height: number;
  blocked: number[];
  walls: number[];
  /** Frame ends, entrance first. */
  endpoints: { port: number }[];
  /** A one-shot puzzle (see Puzzle.oneShot); left out when not. */
  oneShot?: boolean;
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
    ...(isOneShot(p) ? { oneShot: true } : {}),
    code: encodePuzzle(p),
  };
}

export function puzzleFromJson(value: unknown): Puzzle {
  if (!value || typeof value !== 'object') throw new Error('Not a puzzle file.');
  const j = value as Partial<PuzzleJson>;
  if (j.format !== 'bendy-arrows-puzzle') {
    if (typeof j.code === 'string') return decodePuzzle(j.code);
    throw new Error('Not a puzzle file.');
  }
  const w = Number(j.width);
  const h = Number(j.height);
  checkSize(w, h);
  const p = createPuzzle(w, h);
  const ints = (xs: unknown, max: number, what: string): number[] => {
    if (xs === undefined) return [];
    if (!Array.isArray(xs)) throw new Error(`"${what}" must be a list.`);
    return xs.map((x) => {
      if (!Number.isInteger(x) || x < 0 || x >= max) throw new Error(`"${what}" contains an invalid index.`);
      return x as number;
    });
  };
  ints(j.blocked, cellCount(p), 'blocked').forEach((c) => p.blocked.add(c));
  ints(j.walls, edgeCount(p), 'walls').forEach((x) => p.walls.add(x));
  if (j.endpoints !== undefined && !Array.isArray(j.endpoints)) throw new Error('"endpoints" must be a list.');
  const ports = (j.endpoints ?? []).map((x) => (x && typeof x === 'object' ? (x as { port?: unknown }).port : undefined));
  p.endpoints = ints(ports, portCount(p), 'endpoints').slice(0, 2).map(portEnd);
  if (j.oneShot === true && p.endpoints.length === 2) p.oneShot = true;
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
