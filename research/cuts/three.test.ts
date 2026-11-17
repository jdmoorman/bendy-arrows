import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { EASY_RULES } from '../../src/generator';
import { applyStep, deductions, logicStep, type Deduction, type LogicState } from '../../src/logic';
import { SAMPLES } from '../../src/samples';
import { outPath, record } from '../out';

// Do the label method and the original search find the same 3-border-cut deductions, and
// how much faster is it? Checked on every sample at three points along the easy rules.
const NAME = 'cuts/three.txt';
// Compare what each deduction draws (lines and X's): the old search sometimes reaches the
// same marks through the other side of a cut, so the highlighted areas can differ.
const keyOf = (d: Deduction) => JSON.stringify([[...d.segments].sort((a, b) => a - b), [...d.xs].sort((a, b) => a - b)]);

test('labels vs search', () => {
  writeFileSync(outPath(NAME), '');
  let tLabels = 0;
  let tSearch = 0;
  let checks = 0;
  let mismatches = 0;
  for (const s of SAMPLES) {
    const p = decodePuzzle(s.code);
    // States: empty, halfway through the easy rules, and where they stall.
    const states: LogicState[] = [{ segments: new Set(), xs: new Set() }];
    let st = states[0];
    const path: LogicState[] = [];
    for (let i = 0; i < 300; i++) {
      const step = logicStep(p, st, EASY_RULES);
      if (!step.segments.length && !step.xs.length) break;
      st = applyStep(st, step);
      path.push(st);
    }
    if (path.length) states.push(path[Math.floor(path.length / 2)], st);
    for (const state of states) {
      let t = performance.now();
      const a = deductions(p, state, ['balance'], { areaSources: ['cuts3'], threeCuts: 'labels' });
      tLabels += performance.now() - t;
      t = performance.now();
      const b = deductions(p, state, ['balance'], { areaSources: ['cuts3'], threeCuts: 'search' });
      tSearch += performance.now() - t;
      checks++;
      // The old search also re-finds areas cut off by just two borders (a 2-cut plus any
      // third border); those belong to the 1–2-border source, so leave them out.
      const twoCut = new Set(deductions(p, state, ['balance'], { areaSources: ['cuts'] }).map(keyOf));
      const ka = new Set(a.map(keyOf).filter((k) => !twoCut.has(k)));
      const kb = new Set(b.map(keyOf).filter((k) => !twoCut.has(k)));
      const onlyA = [...ka].filter((k) => !kb.has(k)).length;
      const onlyB = [...kb].filter((k) => !ka.has(k)).length;
      if (onlyA || onlyB) {
        mismatches++;
        record(NAME, `MISMATCH ${s.name} (${state.segments.size} lines): labels only ${onlyA}, search only ${onlyB}`);
      }
    }
  }
  record(NAME, `${checks} board states checked, ${mismatches} mismatches`);
  record(NAME, `time in the 3-border pass: labels ${(tLabels / 1000).toFixed(2)} s, search ${(tSearch / 1000).toFixed(2)} s (${(tSearch / tLabels).toFixed(0)}× faster)`);
}, 60 * 60 * 1000);
