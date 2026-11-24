import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { outPath } from '../out';

// Every pack level's hint journey (outcome and hints), with the code in SRC (a src folder;
// default this repo's), for checking a change to the logic leaves hints exactly as they were.
// Output: profile/journeys-<NAME>.json (time taken, and one line per level).
test('journeys', async () => {
  const src = process.env.SRC ?? new URL('../../src', import.meta.url).pathname;
  const { decodePuzzle } = await import(`${src}/codec.ts`);
  const { PACKS } = await import(`${src}/levels.ts`);
  const { hintJourney, strokeJourney } = await import(`${src}/logic.ts`);
  const { isOneShot } = await import(`${src}/model.ts`);
  const t = Date.now();
  const out: string[] = [];
  for (const k of PACKS) for (const c of k.levels) {
    const p = decodePuzzle(c);
    const j = isOneShot(p) ? strokeJourney(p) : hintJourney(p);
    out.push(`${c} ${j.outcome} ${j.steps.map((s: { rule: string; area?: number }) => s.rule + (s.area ?? '')).join(',')}`);
  }
  writeFileSync(outPath(`profile/journeys-${process.env.NAME ?? 'now'}.json`), JSON.stringify({ ms: Date.now() - t, out }, null, 1));
}, 600_000);
