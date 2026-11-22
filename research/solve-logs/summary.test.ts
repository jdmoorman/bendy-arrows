import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { decodePuzzle } from '../../src/codec';
import { hintJourney, searchMetrics } from '../../src/logic';
import { record } from '../out';

// Summarises an exported solve-log file (research/in/<FILE>): per level, the time taken, longest
// pause, erasures, X marks, hints and resets, next to the logic's measures (hints a player
// needs, Crux, Effort); then how well the levels' order follows each measure (Spearman's rank
// correlation with the level number). Output: solve-logs/summary.txt.

const FILE = process.env.FILE ?? 'solve-logs-2026-11-22.txt';

const rank = (xs: number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
};
const spearman = (a: number[], b: number[]) => {
  const ra = rank(a);
  const rb = rank(b);
  const m = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const [ma, mb] = [m(ra), m(rb)];
  let num = 0;
  let da = 0;
  let db = 0;
  ra.forEach((x, i) => {
    num += (x - ma) * (rb[i] - mb);
    da += (x - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  });
  return num / Math.sqrt(da * db);
};

test('solve log summary', () => {
  const text = readFileSync(new URL(`../in/${FILE}`, import.meta.url), 'utf8');
  const blocks = text.split(/\n(?=Solve log for )/).filter((b) => b.startsWith('Solve log for'));
  const rows = blocks.map((b) => {
    const lines = b.trim().split('\n');
    const [, name, code] = lines[0].match(/^Solve log for (.*?), .*#p=(\S+)/)!;
    const steps = lines.slice(2).map((l) => {
      const m = l.match(/^([\d.]+)s (.*)$/)!;
      return { t: +m[1], what: m[2] };
    });
    const solvedAt = steps.find((s) => s.what === 'solved')?.t ?? steps[steps.length - 1].t;
    let pause = 0;
    for (let i = 1; i < steps.length; i++) pause = Math.max(pause, steps[i].t - steps[i - 1].t);
    const count = (re: RegExp) => steps.filter((s) => re.test(s.what)).length;
    const p = decodePuzzle(code);
    const j = hintJourney(p);
    const sm = searchMetrics(p);
    return {
      name,
      code,
      size: `${p.w}×${p.h}`,
      time: solvedAt,
      pause,
      erased: count(/^-line/),
      xs: count(/^\+X/),
      hints: count(/^hint/),
      resets: count(/^reset/),
      needed: j.steps.length,
      crux: sm.tightest,
      effort: sm.effort,
    };
  });
  const out = 'solve-logs/summary.txt';
  record(out, `# ${FILE}: ${rows.length} levels`);
  record(out, ['level', 'size', 'time s', 'longest pause s', 'erased', 'X', 'hints used', 'resets', 'hints needed', 'crux', 'effort'].join('\t'));
  for (const r of rows) record(out, [r.name, r.size, r.time.toFixed(0), r.pause.toFixed(0), r.erased, r.xs, r.hints, r.resets, r.needed, r.crux, r.effort].join('\t'));
  const order = rows.map((_, i) => i + 1);
  record(out, '# Spearman correlation of level order with:');
  for (const [k, v] of [
    ['time', rows.map((r) => r.time)],
    ['longest pause', rows.map((r) => r.pause)],
    ['hints needed', rows.map((r) => r.needed)],
    ['crux', rows.map((r) => r.crux)],
    ['effort', rows.map((r) => r.effort)],
  ] as const)
    record(out, `#   ${k}: ${spearman(order, [...v]).toFixed(2)}`);
  record(out, `#   (time vs effort: ${spearman(rows.map((r) => r.time), rows.map((r) => r.effort)).toFixed(2)}, time vs hints needed: ${spearman(rows.map((r) => r.time), rows.map((r) => r.needed)).toFixed(2)})`);
});
