import { defineConfig } from 'vitest/config';
import { levelsWriter } from './scripts/levels-writer.mjs';

export default defineConfig({
  base: './',
  // Running locally, the creator's Save can rewrite a pack level in src/levels.ts.
  plugins: [levelsWriter()],
  worker: { format: 'es' },
  // Two pages: the player's app (index.html) and the creator's (create.html).
  build: { rollupOptions: { input: { main: 'index.html', create: 'create.html' } } },
  test: {
    include: ['tests/**/*.test.ts'],
    // GitHub's shared servers (which set CI) run about twice as slowly as a laptop.
    testTimeout: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI ? 30_000 : 5_000,
  },
});
