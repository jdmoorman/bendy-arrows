import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The file the level packs live in. */
const FILE = process.env.LEVELS_FILE ?? fileURLToPath(new URL('../src/levels.ts', import.meta.url));
const CODE = /^[A-Za-z0-9_-]+$/;

/** Text as a single-quoted string, as src/levels.ts writes them. */
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Dev server only: lets the creator change src/levels.ts.
 * POST /__levels with {"from": oldCode, "to": newCode} replaces a pack level's code. The old
 * code must appear exactly once and the new one not at all. POST /__packs replaces the whole list of
 * packs (see below). Vite then reloads the page with the changed packs.
 */
export function levelsWriter() {
  return {
    name: 'levels-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__levels', (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only.' });
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { from, to } = JSON.parse(body);
            if (!CODE.test(from) || !CODE.test(to)) throw new Error('That is not a puzzle code.');
            const text = readFileSync(FILE, 'utf8');
            const count = text.split(`'${from}'`).length - 1;
            if (count !== 1) throw new Error(count ? 'That level appears more than once in src/levels.ts.' : 'That level is no longer in src/levels.ts.');
            if (text.includes(`'${to}'`)) throw new Error('That puzzle is already a level.');
            writeFileSync(FILE, text.replace(`'${from}'`, `'${to}'`));
            reply(200, { ok: true });
          } catch (err) {
            reply(400, { error: err instanceof Error ? err.message : String(err) });
          }
        });
      });
      // POST /__packs with {"packs": [{"name", "oneShot", "levels"}], "was": [same]}: the whole
      // list of packs, in order, replacing PACKS in src/levels.ts. "was" is the list as the page
      // loaded it, and must still be what the file holds.
      server.middlewares.use('/__packs', (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only.' });
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { packs, was } = JSON.parse(body);
            const text1 = (x) => typeof x === 'string' && x.trim() !== '' && !/[\n\r]/.test(x);
            const codes = (xs) => Array.isArray(xs) && xs.every((c) => typeof c === 'string' && CODE.test(c));
            const isPacks = (ps) => Array.isArray(ps) && ps.every((p) => p && text1(p.name) && codes(p.levels) && (p.oneShot === undefined || typeof p.oneShot === 'boolean'));
            if (!isPacks(packs) || !isPacks(was)) throw new Error('That is not a list of packs.');
            const names = packs.map((p) => p.name.trim());
            if (new Set(names).size !== names.length) throw new Error('Two packs would have the same name.');
            const all = packs.flatMap((p) => p.levels);
            if (new Set(all).size !== all.length) throw new Error('A level would be in the packs twice.');
            const text = readFileSync(FILE, 'utf8');
            const START = 'export const PACKS: LevelPack[] = [';
            const at = text.indexOf(START);
            const end = at < 0 ? -1 : text.indexOf('\n];', at);
            if (at < 0 || end < 0) throw new Error("Can't find PACKS in src/levels.ts.");
            const open = at + START.length;
            // The packs the file holds now, to compare with what the page loaded.
            const unquote = (q) => q.slice(1, -1).replace(/\\(.)/g, '$1');
            const now = [...text.slice(open, end).matchAll(/\{\s*name: ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),\s*(oneShot: true,\s*)?levels: \[([^\]]*)\],?\s*\}/g)].map((m) => ({
              name: unquote(m[1]),
              oneShot: !!m[2],
              levels: [...m[3].matchAll(/'([A-Za-z0-9_-]+)'/g)].map((c) => c[1]),
            }));
            const key = (ps) => JSON.stringify(ps.map((p) => [p.name, !!p.oneShot, p.levels]));
            if (key(now) !== key(was)) throw new Error('The packs in src/levels.ts have changed since this page loaded. Reload and try again.');
            const list = packs
              .map((p) => `  {\n    name: ${quote(p.name.trim())},\n${p.oneShot ? '    oneShot: true,\n' : ''}    levels: [\n${p.levels.map((c) => `      '${c}',\n`).join('')}    ],\n  },\n`)
              .join('');
            writeFileSync(FILE, text.slice(0, open) + '\n' + list + text.slice(end + 1));
            reply(200, { ok: true });
          } catch (err) {
            reply(400, { error: err instanceof Error ? err.message : String(err) });
          }
        });
      });
    },
  };
}
