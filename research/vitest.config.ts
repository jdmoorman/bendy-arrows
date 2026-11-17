import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Long-running research scripts, kept out of `npm test`.
// Run with `npm run research -- <name filter>`, e.g. `npm run research -- hard-sparse`.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['research/**/*.test.ts'],
    testTimeout: 24 * 60 * 60 * 1000,
    // CPU_PROF_DIR=<dir> writes a CPU profile of each test process there
    // (summarise with `node research/profile/analyse.mjs <dir>`).
    ...(process.env.CPU_PROF_DIR ? { pool: 'forks', execArgv: ['--cpu-prof', `--cpu-prof-dir=${process.env.CPU_PROF_DIR}`] } : {}),
  },
});
