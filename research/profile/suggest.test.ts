import { test } from 'vitest';
import { record } from '../out';

// The editor's tile Suggest on a puzzle (CODE, default an empty 7×7 one-shot), for profiling:
// CPU_PROF_DIR=<dir> npm run research -- profile/suggest. Output: profile/suggest.txt (time and result).
test('suggest tiles', async () => {
  // SRC: another src folder to time (e.g. a copy of an older version), for comparison.
  const src = process.env.SRC ?? new URL('../../src', import.meta.url).pathname;
  const { decodePuzzle } = await import(`${src}/codec.ts`);
  const { ALL_RULES } = await import(`${src}/logic.ts`);
  const { suggest } = await import(`${src}/suggest.ts`);
  const p = decodePuzzle(process.env.CODE ?? 'BjG5CEA');
  const t = Date.now();
  const s = suggest(p, 'tile', ALL_RULES);
  record('profile/suggest.txt', `${process.env.NAME ?? ''} ${process.env.CODE ?? 'BjG5CEA'} ${Date.now() - t} ms ${JSON.stringify(s)}`);
}, 600_000);
