import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The file the level packs live in. */
const FILE = fileURLToPath(new URL('../src/levels.ts', import.meta.url));
const CODE = /^[A-Za-z0-9_-]+$/;

/**
 * Dev server only: lets the creator replace a pack level's code in src/levels.ts.
 * POST /__levels with {"from": oldCode, "to": newCode}. The old code must appear exactly
 * once and the new one not at all; Vite then reloads the page with the changed packs.
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
    },
  };
}
