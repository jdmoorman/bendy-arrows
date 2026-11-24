import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES } from '../../src/logic';
import { keepSingles, scoreTiles, tileCandidates, tilePairs } from '../../src/suggest';
import { record } from '../out';

// How many pairs the tile Suggest plays through, against every pair of opposite colours (CODES,
// comma-separated). Output: profile/pairs.txt.
test('pair counts', () => {
  for (const code of (process.env.CODES ?? 'BiE2CEA,BjG5CEA,BkI1hBA').split(',')) {
    const p = decodePuzzle(code);
    const candidates = tileCandidates(p);
    const singles = keepSingles(scoreTiles(p, candidates.map((c) => [c]), ALL_RULES, {}));
    const pairs = tilePairs(p, singles, candidates);
    const odd = (c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
    const all = candidates.filter(odd).length * candidates.filter((c) => !odd(c)).length;
    record('profile/pairs.txt', `${code} ${p.w}x${p.h}: ${candidates.length} tiles, ${singles.length} kept singles, ${pairs.length} pairs tried, ${all} opposite-colour pairs in all`);
  }
}, 600_000);
