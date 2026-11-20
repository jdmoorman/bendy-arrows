import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { rateDifficulty } from '../../src/generator';
import { AREA_SOURCES, type AreaSource } from '../../src/logic';
import { SAMPLES } from '../../tests/samples';
import { outPath, record } from '../out';

// Switch off rooms plus two other kinds of area and re-rate every sample. A sample that
// gets harder only when all three are off shows a three-way overlap. Both kinds of cut
// (one or two borders, and three) count as a single kind here.
const NAME = 'areas/triples.txt';
const ORDER = ['easy', 'medium', 'hard', 'veryhard'];
const SHORT: Record<string, string> = { easy: 'E', medium: 'M', hard: 'H', veryhard: 'VH' };
const KINDS: Record<string, AreaSource[]> = { rooms: ['rooms'], cuts: ['cuts', 'cuts3'], rects: ['rects'] };

test('groups of three with rooms', () => {
  writeFileSync(outPath(NAME), 'cuts = areas cut off by one, two or three borders\n');
  const puzzles = SAMPLES.map((s) => ({ s, p: decodePuzzle(s.code) }));
  // Ratings with some kinds off, cached by which are off.
  const cache = new Map<string, number[]>();
  const rate = (kinds: string[]) => {
    const key = [...kinds].sort().join('+');
    if (!cache.has(key)) {
      const off = new Set(kinds.flatMap((k) => KINDS[k]));
      cache.set(key, puzzles.map(({ p }) => ORDER.indexOf(rateDifficulty(p, { areaSources: AREA_SOURCES.filter((x) => !off.has(x)) }))));
    }
    return cache.get(key)!;
  };
  const base = rate([]);
  const others = Object.keys(KINDS).filter((x) => x !== 'rooms');
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const group = ['rooms', others[i], others[j]];
      const t = Date.now();
      const all3 = rate(group);
      const pairs = [[group[0], group[1]], [group[0], group[2]], [group[1], group[2]]].map(rate);
      const harder: string[] = [];
      const tripleOnly: string[] = [];
      puzzles.forEach(({ s }, k) => {
        if (all3[k] <= base[k]) return;
        const label = `${s.name} (${SHORT[ORDER[base[k]]]}→${SHORT[ORDER[all3[k]]]})`;
        harder.push(label);
        if (all3[k] > Math.max(...pairs.map((x) => x[k]))) tripleOnly.push(label);
      });
      record(NAME, `without ${group.join(' + ')}: ${harder.length} harder, ${tripleOnly.length} only when all three are off (${Math.round((Date.now() - t) / 1000)} s)${tripleOnly.length ? '\n   all three needed off: ' + tripleOnly.join('; ') : ''}`);
    }
  }
}, 2 * 60 * 60 * 1000);
