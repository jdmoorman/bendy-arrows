import { existsSync, readFileSync } from 'node:fs';
import { encodePuzzle } from '../../src/codec';
import { generate, obstacleCount } from '../../src/generator';
import { hintJourney } from '../../src/logic';
import { outPath, record } from '../out';

/** Importable level list of every hard puzzle found, shared by all the runs. */
export const LIST = 'hard-large/hard-levels.txt';
const CAP = 100;

const found = () => (existsSync(outPath(LIST)) ? readFileSync(outPath(LIST), 'utf8').split('\n').filter(Boolean).length : 0);

/**
 * Generate sparse puzzles of one size (minimal clues, extra black tiles to start), seed after seed, and save every hard one
 * to the level list as soon as it's found. Each run takes its own seed range, so several can
 * run at once. Stops after RESEARCH_MINUTES (default 60) or when the list holds CAP puzzles.
 * Every attempt is logged to hard-large/log-<w>x<h>-<run>.txt.
 */
export function hardLarge(w: number, h: number, run: number): void {
  const log = `hard-large/log-${w}x${h}-${run}.txt`;
  const end = Date.now() + Number(process.env.RESEARCH_MINUTES ?? 60) * 60 * 1000;
  for (let seed = run * 1_000_000 + w * 10_000; Date.now() < end && found() < CAP; seed++) {
    const t0 = Date.now();
    let r;
    try {
      r = generate({ w, h, difficulties: ['hard'], clues: 'mixed', minimal: true, attempts: 1, seed, blackDensity: [0.05, 0.15] });
    } catch {
      record(log, `seed ${seed} failed (${Date.now() - t0} ms)`);
      continue;
    }
    record(log, `seed ${seed} ${r.difficulty ?? 'none'} (${Date.now() - t0} ms)`);
    if (r.difficulty !== 'hard') continue;
    const p = r.puzzle;
    const hints = hintJourney(p).steps.length;
    record(LIST, `Hard ${w}×${h} · ${obstacleCount(p)} obstacles · ${hints} hints (seed ${seed}) — #p=${encodePuzzle(p)}`);
  }
}
