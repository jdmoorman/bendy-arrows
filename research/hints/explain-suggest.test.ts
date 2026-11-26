import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { ALL_RULES, hintJourney, RULES } from '../../src/logic';
import { edgeCells } from '../../src/model';
import { solve } from '../../src/solver';
import { suggest } from '../../src/suggest';
import { writeFileSync } from 'node:fs';
import { outPath, record } from '../out';

// Why Suggest picks the wall it does: the hint journey before and after, for one puzzle code.
const CODE = process.env.CODE ?? 'Bwc9gcMyEsPh';
const NAME = 'hints/explain-suggest.txt';
const log = (...a: unknown[]) => record(NAME, a.map(String).join(' '));
test('explain suggest', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(CODE);
  const rc = (c: number) => `(${Math.floor(c / p.w) + 1},${(c % p.w) + 1})`;
  const edge = (e: number) => edgeCells(p, e).map(rc).join('|');
  log(`${p.w}x${p.h} walls ${[...p.walls].map(edge).join(' ')} blocked ${[...p.blocked].map(rc).join(' ')}`);
  log('endpoints', JSON.stringify(p.endpoints), 'solutions', solve(p, { maxSolutions: 10 }).status);
  const show = (label: string, q: typeof p) => {
    const j = hintJourney(q, {}, undefined, ALL_RULES);
    log(label, j.outcome, j.steps.map((x) => `${RULES.find((r) => r.id === x.rule)!.label}${x.area ? ` (${x.area})` : ''}`).join(' → '));
  };
  show('BEFORE', p);
  const s = suggest(p, 'wall', ALL_RULES);
  log('SUGGEST', JSON.stringify(s), s && s.at.map(edge), s?.remove?.map(edge));
  if (s) {
    const q = { ...p, walls: new Set(p.walls) };
    for (const e of s.at) q.walls.add(e);
    for (const e of s.remove ?? []) q.walls.delete(e);
    log('after solutions', solve(q, { maxSolutions: 10 }).status);
    show('AFTER', q);
  }
});
