import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { ADVANCED_RULES, ALL_RULES, findStrokeHint, runStroke, strokeFrom, STROKE_HINT_ORDER, type LogicState } from '../../src/logic';
import { edgeCount, openCells, type Puzzle } from '../../src/model';
import { outPath, record } from '../out';

// The earlier big-strokes finds (big-strokes/found-*.tsv and old/), checked as search.test.ts
// checks its own: the stroke finished with hints that never hand over checkerboard X marks.
// Output: xl-strokes/recheck.tsv (as found-*.tsv).

const EASY = ALL_RULES.filter((r) => !ADVANCED_RULES.includes(r));

function journey(p: Puzzle): string[] | null {
  let state: LogicState = { segments: new Set(), xs: new Set() };
  const rules: string[] = [];
  for (let i = 0; i <= 2 * edgeCount(p); i++) {
    const run = runStroke(p, EASY, state);
    state = run.state;
    if (run.solved) return rules;
    if (run.contradiction) return null;
    const { tiles, lines } = strokeFrom(p, state.segments);
    const h = findStrokeHint(p, lines, tiles[tiles.length - 1], {}, STROKE_HINT_ORDER, state.xs);
    if (h.kind === 'solved') return rules;
    if (h.kind !== 'deduction') return null;
    const d = h.deduction;
    if ((d.rule === 'balance' || d.rule === 'imbalance') && !d.segments.length) return null;
    rules.push(d.rule + (d.cells ? d.cells.length : ''));
    state = { segments: new Set([...lines, ...d.segments]), xs: new Set([...state.xs, ...d.xs]) };
  }
  return null;
}

test('recheck big strokes', () => {
  const dir = outPath('big-strokes');
  const files = [...readdirSync(dir).filter((f) => f.startsWith('found-')).map((f) => `${dir}/${f}`), ...readdirSync(`${dir}/old`).filter((f) => f.startsWith('found-')).map((f) => `${dir}/old/${f}`)];
  const codes = new Set(files.flatMap((f) => readFileSync(f, 'utf8').trim().split('\n')).map((l) => l.split('\t')[0]).filter(Boolean));
  for (const code of codes) {
    const p = decodePuzzle(code);
    const rules = journey(p);
    if (rules) record('xl-strokes/recheck.tsv', [code, `${p.w}x${p.h}`, openCells(p).length, p.blocked.size, rules.length, rules.join(' ')].join('\t'));
  }
});
