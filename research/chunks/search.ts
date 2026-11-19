import { existsSync, readFileSync } from 'node:fs';
import { encodePuzzle } from '../../src/codec';
import { generate, obstacleCount, openTilesOk, type Difficulty } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { edgeBetween, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

const CAP = 100;
const lines = (name: string) => (existsSync(outPath(name)) ? readFileSync(outPath(name), 'utf8').split('\n').filter(Boolean).length : 0);

/**
 * Split the board into k×k chunks walled off from each other, with a few holes in each
 * wall between neighbouring chunks, then scatter obstacles in each chunk, some chunks
 * much emptier than others (the empty ones should take the most thought).
 */
export function chunkLayout(k: number) {
  return (p: Puzzle, rand: () => number): boolean => {
    const at = (r: number, c: number) => r * p.w + c;
    // Walls along every chunk boundary, with holes in each shared side: anywhere from one hole
    // (two for chunks of 4: nine chunks rarely link up through fewer) to about 60% open, so
    // some boundaries are solid and some only half there.
    const minHoles = k <= 4 ? 2 : 1;
    const boundary = (edges: number[]) => {
      const holes = Math.max(minHoles, Math.round(edges.length * rand() * 0.6));
      const open = new Set<number>();
      while (open.size < Math.min(holes, edges.length)) open.add(Math.floor(rand() * edges.length));
      edges.forEach((e, i) => !open.has(i) && p.walls.add(e));
    };
    for (let r0 = 0; r0 < p.h; r0 += k) {
      for (let c0 = 0; c0 < p.w; c0 += k) {
        const rows = Math.min(k, p.h - r0);
        const cols = Math.min(k, p.w - c0);
        // The side to the right of this chunk, and the side below it.
        if (c0 + k < p.w) boundary(Array.from({ length: rows }, (_, i) => edgeBetween(p, at(r0 + i, c0 + k - 1), at(r0 + i, c0 + k))));
        if (r0 + k < p.h) boundary(Array.from({ length: cols }, (_, i) => edgeBetween(p, at(r0 + k - 1, c0 + i), at(r0 + k, c0 + i))));
        // Obstacles inside: each chunk gets its own density, from none to dense.
        const density = [0, 0.04, 0.1, 0.18][Math.floor(rand() * 4)];
        const cells = Array.from({ length: rows * cols }, (_, i) => at(r0 + Math.floor(i / cols), c0 + (i % cols)));
        const want = Math.round(cells.length * density);
        for (let n = 0, tries = 0; n < want && tries < 20 * want; tries++) {
          const c = cells[Math.floor(rand() * cells.length)];
          if (rand() < 0.4) {
            if (p.blocked.has(c)) continue;
            p.blocked.add(c);
            if (!openTilesOk(p)) {
              p.blocked.delete(c);
              continue;
            }
          } else {
            // A wall inside the chunk, right of or below the tile.
            const [r, col] = [Math.floor(c / p.w), c % p.w];
            const right = rand() < 0.5;
            if (right ? col + 1 >= c0 + cols : r + 1 >= r0 + rows) continue;
            const e = edgeBetween(p, c, right ? c + 1 : c + p.w);
            if (p.walls.has(e)) continue;
            p.walls.add(e);
          }
          n++;
        }
      }
    }
    return true;
  };
}

const NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', veryhard: 'Very hard' };

/**
 * Generate size×size puzzles from chunk layouts, seed after seed, simplified (minimal clues),
 * saving every one (all have a unique solution) to an importable level list per chunk
 * strategy and difficulty: chunks/<size>-k<k>/<difficulty>.txt. Stops after RESEARCH_MINUTES
 * (default 90) or at CAP hard puzzles for the strategy. Every attempt is logged.
 */
export function chunkSearch(size: number, k: number, run: number): void {
  const tag = `${size}-k${k}`;
  const list = (d: Difficulty) => `chunks/${tag}/${d}.txt`;
  const log = `chunks/${tag}/log-${run}.txt`;
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 90) * 60 * 1000;
  for (let seed = run * 1_000_000 + size * 10_000 + k * 1000; Date.now() < end && lines(list('hard')) < CAP; seed++) {
    const t0 = Date.now();
    let r;
    try {
      r = generate({ w: size, h: size, difficulties: ['hard'], clues: 'mixed', minimal: true, attempts: 1, seed, prepare: chunkLayout(k) });
    } catch {
      record(log, `seed ${seed} failed (${Date.now() - t0} ms)`);
      continue;
    }
    record(log, `seed ${seed} ${r.difficulty} (${Date.now() - t0} ms)`);
    const p = r.puzzle;
    const j = hintJourney(p);
    const hints = `${String(j.steps.length).padStart(2, '0')}${j.outcome === 'stuck' ? '+' : ''} hints`;
    record(list(r.difficulty), `${NAMES[r.difficulty]} ${size}×${size} · chunks ${k} · ${hints} · ${String(obstacleCount(p)).padStart(2, '0')} obstacles (seed ${seed}) — #p=${encodePuzzle(p)}`);
  }
}
