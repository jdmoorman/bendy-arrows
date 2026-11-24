import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { PACKS, levelName } from '../../src/levels';
import { ALL_RULES } from '../../src/logic';
import { cellRC, clonePuzzle } from '../../src/model';
import { suggest } from '../../src/suggest';
import { record } from '../out';

// When does the tile Suggest clear a black tile rather than add a second? Boards part-way built:
// pack levels (up to MAX_SIDE) with a pair of their black tiles cleared (one of each colour),
// and the levels as they are. Output: profile/removal.txt, one line per board.
test('removal', () => {
  const max = Number(process.env.MAX_SIDE ?? 8);
  const odd = (p: { w: number }, c: number) => (Math.floor(c / p.w) + (c % p.w)) % 2 === 1;
  for (const k of PACKS) {
    k.levels.forEach((code, li) => {
      const p0 = decodePuzzle(code);
      if (p0.walls.size || p0.blocked.size < 2 || Math.max(p0.w, p0.h) > max) return;
      const s = [...p0.blocked].find((c) => odd(p0, c));
      const w = [...p0.blocked].find((c) => !odd(p0, c));
      for (const [label, p] of [['as is', p0], ['a pair cleared', (() => { const q = clonePuzzle(p0); if (s !== undefined) q.blocked.delete(s); if (w !== undefined) q.blocked.delete(w); return q; })()]] as const) {
        const t = Date.now();
        const r = suggest(p, 'tile', ALL_RULES);
        const tiles = (cs?: number[]) => (cs ?? []).map((c) => cellRC(p, c).join(',')).join(' ');
        record('profile/removal.txt', `${levelName({ pack: PACKS.indexOf(k), level: li })} (${label}, ${p.w}x${p.h}, ${p.blocked.size} black): ${r ? `${r.remove ? 'CLEAR ' + tiles(r.remove) + ' + ' : ''}add ${tiles(r.at)} -> ${r.hints} hints${r.stuck ? ' stuck' : ''} (was ${r.hintsBefore})` : 'nothing'} [${Date.now() - t} ms]`);
      }
    });
  }
}, 24 * 60 * 60 * 1000);
