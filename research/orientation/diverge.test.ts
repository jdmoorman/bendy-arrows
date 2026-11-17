import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { RATING_RULES } from '../../src/generator';
import { applyStep, deductions, logicStep, type LogicState } from '../../src/logic';
import { clonePuzzle, edgeCells, cellRC, orientEnds, transformPuzzle, type Puzzle, type Transform } from '../../src/model';
import { outPath, record } from '../out';

// The 7×7 sample that rated very hard facing one way and hard after orientEnds turned it.
const OLD = 'BQQHBwANABgBAEACAAAACAAACAAAAAABEA';
const NAME = 'orientation/diverge.txt';

/** Map a set of edges through a transform, by carrying them as walls. */
function mapEdges(p: Puzzle, edges: Iterable<number>, t: Transform): Set<number> {
  const q = clonePuzzle(p);
  q.walls = new Set(edges);
  q.blocked = new Set();
  return transformPuzzle(q, t).walls;
}

const edgeName = (p: Puzzle, e: number) => {
  const [a, b] = edgeCells(p, e).map((c) => cellRC(p, c).join(','));
  return `${a}-${b}`;
};

test('find where the logic diverges between orientations', () => {
  writeFileSync(outPath(NAME), '');
  const a = decodePuzzle(OLD);
  const b = orientEnds(a);
  // Which transform did orientEnds use?
  const t = (['flipH', 'flipV', 'rotateLeft', 'rotateRight'] as Transform[]).find((x) => JSON.stringify([...transformPuzzle(a, x).walls].sort()) === JSON.stringify([...b.walls].sort()))!;
  record(NAME, `transform: ${t}`);
  let sa: LogicState = { segments: new Set(), xs: new Set() };
  let sb: LogicState = { segments: new Set(), xs: new Set() };
  for (let round = 1; round <= 200; round++) {
    const da = logicStep(a, sa, RATING_RULES);
    const db = logicStep(b, sb, RATING_RULES);
    const segA = mapEdges(a, da.segments, t);
    const xA = mapEdges(a, da.xs, t);
    const sameSeg = segA.size === db.segments.length && db.segments.every((e) => segA.has(e));
    const sameX = xA.size === db.xs.length && db.xs.every((e) => xA.has(e));
    record(NAME, `round ${round}: old +${da.segments.length} lines +${da.xs.length} X (${JSON.stringify(da.byRule)}) | new +${db.segments.length} lines +${db.xs.length} X (${JSON.stringify(db.byRule)})${da.solved ? ' old solved' : ''}${db.solved ? ' new solved' : ''}`);
    if (!sameSeg || !sameX) {
      record(NAME, `DIVERGES at round ${round}`);
      const onlyNewSeg = db.segments.filter((e) => !segA.has(e));
      const onlyNewX = db.xs.filter((e) => !xA.has(e));
      const onlyOld = [...segA].filter((e) => !db.segments.includes(e)).concat([...xA].filter((e) => !db.xs.includes(e)));
      record(NAME, `only new finds: lines ${onlyNewSeg.map((e) => edgeName(b, e)).join(' ')} | X ${onlyNewX.map((e) => edgeName(b, e)).join(' ')}`);
      record(NAME, `only old finds (in new coords): ${onlyOld.map((e) => edgeName(b, e)).join(' ')}`);
      // Which deductions produce the new-only marks, and are they missing from the old orientation?
      const all = deductions(b, sb, RATING_RULES);
      for (const d of all) {
        const marks = [...d.segments, ...d.xs];
        if (!marks.some((e) => onlyNewSeg.includes(e) || onlyNewX.includes(e))) continue;
        record(NAME, `new deduction: rule=${d.rule} cell=${cellRC(b, d.cell)} area=${d.cells?.length ?? '-'} cells=[${(d.cells ?? []).map((c) => cellRC(b, c).join(',')).join(' ')}] lines=${d.segments.map((e) => edgeName(b, e)).join(' ')} X=${d.xs.map((e) => edgeName(b, e)).join(' ')} why=${d.why ?? ''}`);
      }
      // Old orientation state, mapped, for the record.
      record(NAME, `state before: old ${sa.segments.size} lines ${sa.xs.size} X; new ${sb.segments.size} lines ${sb.xs.size} X`);
      // Save puzzle + state of the new orientation so it can be drawn.
      record(NAME, `new puzzle ${JSON.stringify({ w: b.w, h: b.h, walls: [...b.walls], blocked: [...b.blocked] })}`);
      record(NAME, `new state ${JSON.stringify({ segments: [...sb.segments], xs: [...sb.xs] })}`);
      record(NAME, `old deductions at this round: ${deductions(a, sa, RATING_RULES).length}, new: ${all.length}`);
      return;
    }
    if (da.solved || db.solved || da.contradiction || db.contradiction) break;
    if (!da.segments.length && !da.xs.length && !db.segments.length && !db.xs.length) {
      record(NAME, 'both stuck without diverging');
      break;
    }
    sa = applyStep(sa, da);
    sb = applyStep(sb, db);
  }
});
