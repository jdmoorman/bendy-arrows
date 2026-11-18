import { encodePuzzle } from '../../src/codec';
import { generate, obstacleCount, type GenType } from '../../src/generator';
import { record } from '../out';

/**
 * Look for hard puzzles with few obstacles, trying seed after seed until time runs out.
 * Once one is found, only accept puzzles with at most 2 more obstacles than the best so far.
 * Writes each result to research/out/hard-sparse/<type>-<w>x<h>.txt as it is found.
 * The run length is RESEARCH_MINUTES (default 40).
 */
export function hardSparse(type: GenType, w: number, h: number): void {
  const name = `hard-sparse/${type}-${w}x${h}.txt`;
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 40) * 60 * 1000;
  let best = Infinity;
  for (let seed = 1001; Date.now() < end; seed++) {
    let r;
    try {
      r = generate({
        w, h, type, difficulties: ['hard'], clues: 'mixed', minimal: true, attempts: 40, seed,
        maxObstacles: Number.isFinite(best) ? best + 2 : undefined,
      });
    } catch {
      continue;
    }
    if (r.difficulty !== 'hard') {
      record(name, `seed ${seed} miss ${r.difficulty}`);
      continue;
    }
    const n = obstacleCount(r.puzzle);
    best = Math.min(best, n);
    record(name, `HARD ${n} seed ${seed} ${encodePuzzle(r.puzzle)}`);
  }
}
