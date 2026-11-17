import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Long-running research scripts, kept out of `npm test`.
// Run with `npm run research -- <name filter>`, e.g. `npm run research -- hard-sparse`.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['research/**/*.test.ts'],
    testTimeout: 24 * 60 * 60 * 1000,
  },
});
