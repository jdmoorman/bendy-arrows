import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { AREA_SOURCES, type AreaSource } from '../../src/logic';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

// Switch off each pair of area sources and re-rate every sample. A sample that gets
// harder only when both are off shows the two cover for each other.
const NAME = 'areas/pairs.txt';
const ORDER = ['easy', 'medium', 'hard', 'veryhard'];
const SHORT: Record<string, string> = { easy: 'E', medium: 'M', hard: 'H', veryhard: 'VH' };

test('pairs of area sources', () => {
  writeFileSync(outPath(NAME), '');
  const puzzles = SAMPLES.map((s) => ({ s, p: decodePuzzle(s.code) }));
  const base = puzzles.map(({ p }) => rateDifficulty(p));
  // Ratings with each single source off, to tell pair-only effects apart.
  const single = new Map<AreaSource, string[]>();
  for (const src of AREA_SOURCES) single.set(src, puzzles.map(({ p }) => rateDifficulty(p, { areaSources: AREA_SOURCES.filter((x) => x !== src) })));
  for (let i = 0; i < AREA_SOURCES.length; i++) {
    for (let j = i + 1; j < AREA_SOURCES.length; j++) {
      const a = AREA_SOURCES[i];
      const b = AREA_SOURCES[j];
      const t = Date.now();
      const harder: string[] = [];
      const pairOnly: string[] = [];
      puzzles.forEach(({ s, p }, k) => {
        const r = rateDifficulty(p, { areaSources: AREA_SOURCES.filter((x) => x !== a && x !== b) });
        if (ORDER.indexOf(r) <= ORDER.indexOf(base[k])) return;
        const label = `${s.name} (${SHORT[base[k]]}→${SHORT[r]})`;
        harder.push(label);
        // Harder than with either one off alone: the pair was covering for each other.
        const worst = Math.max(ORDER.indexOf(single.get(a)![k]), ORDER.indexOf(single.get(b)![k]));
        if (ORDER.indexOf(r) > worst) pairOnly.push(label);
      });
      record(NAME, `without ${a} + ${b}: ${harder.length} harder, ${pairOnly.length} only when both are off (${Math.round((Date.now() - t) / 1000)} s)${pairOnly.length ? '\n   both needed off: ' + pairOnly.join('; ') : ''}`);
    }
  }
}, 2 * 60 * 60 * 1000);
