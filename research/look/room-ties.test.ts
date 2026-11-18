import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { decodePuzzle } from '../../src/codec';
import { deductions } from '../../src/logic';
import { cellEdges, edgeBetween, edgeCells, isUsableEdge, neighbors } from '../../src/model';
import { outPath, record } from '../out';

// Replay room growth (empty board) to see where ties stop it short of the area a balance
// deduction uses. Coordinates are 1-based (row,column).
const NAME = 'look/room-ties.txt';
test('room ties', () => {
  writeFileSync(outPath(NAME), '');
  const p = decodePuzzle(process.env.CODE!);
  const [r, c1, c2] = process.env.EDGE!.split(',').map(Number);
  const edge = edgeBetween(p, (r - 1) * p.w + c1 - 1, (r - 1) * p.w + c2 - 1);
  const d = deductions(p, { segments: new Set(), xs: new Set() }, ['balance']).find((x) => x.segments.includes(edge))!;
  const target = new Set(d.cells!);
  const rc = (c: number) => `${Math.floor(c / p.w) + 1},${(c % p.w) + 1}`;
  const other = (e: number, c: number) => edgeCells(p, e).find((x) => x !== c)!;
  record(NAME, `target area (${target.size} tiles): ${[...target].map(rc).join(' ')}`);
  for (const seed of target) {
    const area = [seed];
    const inA = new Set(area);
    const steps: string[] = [rc(seed)];
    let note = '';
    while (area.length < target.size) {
      // Score every neighbour: borders added (its borders out minus those into the room), then contact.
      const scored: { m: number; delta: number; touch: number }[] = [];
      const seen = new Set<number>();
      for (const t of area) for (const m of neighbors(p, t)) {
        if (inA.has(m) || seen.has(m)) continue;
        seen.add(m);
        let delta = 0;
        for (const e of cellEdges(p, m)) if (isUsableEdge(p, e)) delta += inA.has(other(e, m)) ? -1 : 1;
        scored.push({ m, delta, touch: neighbors(p, m).filter((x) => inA.has(x)).length });
      }
      scored.sort((a, b) => a.delta - b.delta || b.touch - a.touch);
      const best = scored.filter((x) => x.delta === scored[0].delta && x.touch === scored[0].touch);
      if (best.length > 1 && process.env.ADD_ALL) {
        // Variant: add every tied tile at once.
        if (best.some((x) => !target.has(x.m))) { note = `goes outside the area: adds ${best.map((x) => rc(x.m)).join(', ')} together`; break; }
        for (const x of best) { area.push(x.m); inA.add(x.m); }
        steps.push(`[${best.map((x) => rc(x.m)).join(' ')}](+${scored[0].delta} each)`);
        continue;
      }
      if (best.length > 1) {
        const inside = best.filter((x) => target.has(x.m)).map((x) => rc(x.m));
        const outside = best.filter((x) => !target.has(x.m)).map((x) => rc(x.m));
        note = `TIE after ${area.length} tiles between ${best.map((x) => rc(x.m)).join(', ')} (each adds ${scored[0].delta} border${scored[0].delta === 1 ? '' : 's'} and touches the room on ${scored[0].touch} side${scored[0].touch === 1 ? '' : 's'})` +
          (outside.length ? `; ${outside.join(', ')} ${outside.length === 1 ? 'is' : 'are'} outside the area` : '; all inside the area');
        break;
      }
      const m = best[0].m;
      if (!target.has(m)) { note = `goes outside the area: adds ${rc(m)}`; break; }
      area.push(m);
      inA.add(m);
      steps.push(`${rc(m)}(+${best[0].delta})`);
    }
    record(NAME, `seed ${rc(seed)}: ${steps.join(' ')}\n   -> ${note || 'REACHES the area'}`);
  }
});
