import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    // GitHub's shared servers (which set CI) run about twice as slowly as a laptop.
    testTimeout: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI ? 30_000 : 5_000,
  },
});
