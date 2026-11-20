import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The file the level packs live in. */
const FILE = fileURLToPath(new URL('../src/levels.ts', import.meta.url));
const CODE = /^[A-Za-z0-9_-]+$/;

/** Text as a single-quoted string, as src/levels.ts writes them. */
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Dev server only: lets the creator change src/levels.ts.
 * POST /__levels with {"from": oldCode, "to": newCode} replaces a pack level's code. The old
 * code must appear exactly once and the new one not at all. POST /__packs reorders the packs
 * and renames and redescribes them (see below). Vite then reloads the page with the changed packs.
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
      // POST /__packs with {"packs": [{"name", "levels", "newName"?, "description"?}]}: new
      // orders (and names and descriptions) for the packs called `name`. Levels may move between
      // them, but none may be added or removed.
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
            const { packs } = JSON.parse(body);
            if (!Array.isArray(packs)) throw new Error('No packs given.');
            let text = readFileSync(FILE, 'utf8');
            const text1 = (x) => typeof x === 'string' && x.trim() !== '' && !/[\n\r]/.test(x);
            // Where each pack sits in the file: from its name to the end of its level list.
            const spots = packs.map(({ name, newName, description, levels }) => {
              if (!text1(name) || !Array.isArray(levels) || !levels.every((c) => typeof c === 'string' && CODE.test(c))) throw new Error('That is not a pack.');
              if (newName !== undefined && !text1(newName)) throw new Error('A pack name must be one line, not empty.');
              if (description !== undefined && !text1(description)) throw new Error('A pack description must be one line, not empty.');
              const at = text.indexOf(`name: ${quote(name)},`);
              if (at < 0 || text.indexOf(`name: ${quote(name)},`, at + 1) >= 0) throw new Error(`Can't find the pack "${name}" in src/levels.ts.`);
              const open = text.indexOf('levels: [', at) + 'levels: ['.length;
              const close = text.indexOf(']', open);
              return { at, open, close, old: [...text.slice(open, close).matchAll(/'([A-Za-z0-9_-]+)'/g)].map((m) => m[1]), name, newName, description, levels };
            });
            const sorted = (xs) => [...xs].sort().join(',');
            if (sorted(spots.flatMap((s) => s.old)) !== sorted(spots.flatMap((s) => s.levels))) {
              throw new Error('The packs in src/levels.ts have changed since this page loaded. Reload and try again.');
            }
            const names = spots.map((s) => s.newName ?? s.name);
            if (new Set(names).size !== names.length) throw new Error('Two packs would have the same name.');
            for (const s of [...spots].sort((a, b) => b.at - a.at)) {
              const indent = text.slice(text.lastIndexOf('\n', s.close) + 1, s.close);
              const levels = '\n' + s.levels.map((c) => `${indent}  '${c}',\n`).join('') + indent;
              let head = text.slice(s.at, s.open);
              head = head.replace(/^name: (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"),/, () => `name: ${quote(s.newName ?? s.name)},`);
              if (s.description !== undefined) {
                const before = head;
                head = head.replace(/description:\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/, () => `description: ${quote(s.description)}`);
                if (head === before && !head.includes(`description: ${quote(s.description)}`)) throw new Error(`Can't find the description of "${s.name}" in src/levels.ts.`);
              }
              text = text.slice(0, s.at) + head + levels + text.slice(s.close);
            }
            writeFileSync(FILE, text);
            reply(200, { ok: true });
          } catch (err) {
            reply(400, { error: err instanceof Error ? err.message : String(err) });
          }
        });
      });
    },
  };
}
