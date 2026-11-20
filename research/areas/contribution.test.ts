import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { AREA_SOURCES, type AreaSource } from '../../src/logic';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

// How much does each source of areas for Checkerboard balance matter? Re-rate every
// sample with each source switched off in turn and note which ratings get harder.
const NAME = 'areas/contribution.txt';
const ORDER = ['easy', 'medium', 'hard', 'veryhard'];
const SHORT: Record<string, string> = { easy: 'E', medium: 'M', hard: 'H', veryhard: 'VH' };

test('area source contribution', () => {
  writeFileSync(outPath(NAME), `columns: rating with everything | ${AREA_SOURCES.map((x) => `without ${x}`).join(' | ')}\n`);
  const harder = Object.fromEntries(AREA_SOURCES.map((x) => [x, [] as string[]])) as Record<AreaSource, string[]>;
  const time: Record<string, number> = Object.fromEntries([['all', 0], ...AREA_SOURCES.map((x) => [x, 0])]);
  for (const s of SAMPLES) {
    const p = decodePuzzle(s.code);
    let t = Date.now();
    const base = rateDifficulty(p);
    time.all += Date.now() - t;
    const without: string[] = [];
    for (const src of AREA_SOURCES) {
      t = Date.now();
      const r = rateDifficulty(p, { areaSources: AREA_SOURCES.filter((x) => x !== src) });
      time[src] += Date.now() - t;
      const worse = ORDER.indexOf(r) > ORDER.indexOf(base);
      if (worse) harder[src].push(`${s.name} (${SHORT[base]}→${SHORT[r]})`);
      without.push(worse ? `${SHORT[r]}!` : SHORT[r]);
    }
    record(NAME, `${SHORT[base].padEnd(3)}| ${without.map((x) => x.padEnd(4)).join('| ')}| ${s.group ?? 'core'} | ${s.name}`);
  }
  record(NAME, '\nSUMMARY: samples that get harder without each source');
  for (const src of AREA_SOURCES) record(NAME, `  without ${src}: ${harder[src].length}${harder[src].length ? ' — ' + harder[src].join('; ') : ''}`);
  record(NAME, `\nTIME (rating all samples, s): ${Object.entries(time).map(([k, v]) => `${k === 'all' ? 'everything' : 'without ' + k} ${Math.round(v / 1000)}`).join(', ')}`);
}, 3 * 60 * 60 * 1000);
