import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Maintenance scripts that need the app's TypeScript, kept out of `npm test`.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['scripts/**/*.test.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});
