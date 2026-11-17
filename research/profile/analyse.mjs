// Summarise V8 .cpuprofile files: self time and inclusive time per function, and self time per file.
// usage: node research/profile/analyse.mjs <dir-of-cpuprofiles> [top]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const top = Number(process.argv[3] ?? 25);
const self = new Map();
const incl = new Map();
const files = new Map();
let total = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.cpuprofile'))) {
  const prof = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const dt = new Map();
  prof.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (prof.timeDeltas[i] ?? 0)));
  const name = (n) => {
    const cf = n.callFrame;
    const file = cf.url.split('/').slice(-1)[0].replace(/\?.*$/, '') || '(native)';
    return { fn: `${cf.functionName || '(anonymous)'} ${file}:${cf.lineNumber + 1}`, file };
  };
  for (const [id, us] of dt) {
    const n = byId.get(id);
    const { fn, file } = name(n);
    if (/^\((idle|program|garbage collector)\)/.test(n.callFrame.functionName)) {
      self.set(n.callFrame.functionName, (self.get(n.callFrame.functionName) ?? 0) + us);
      total += us;
      continue;
    }
    total += us;
    self.set(fn, (self.get(fn) ?? 0) + us);
    files.set(file, (files.get(file) ?? 0) + us);
    // Inclusive: every distinct function on the stack gets this sample once.
    const onStack = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) onStack.add(name(byId.get(cur)).fn);
    for (const s of onStack) incl.set(s, (incl.get(s) ?? 0) + us);
  }
}
const pct = (us) => `${((100 * us) / total).toFixed(1).padStart(5)}%`;
const show = (title, m, filter = () => true) => {
  console.log(`\n${title}`);
  for (const [k, v] of [...m].filter(([k]) => filter(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`  ${pct(v)}  ${k}`);
};
console.log(`total ${(total / 1e6).toFixed(1)} s`);
show('SELF time by file', files);
show('SELF time by function', self);
show('INCLUSIVE time (src functions)', incl, (k) => /\.ts:/.test(k));
