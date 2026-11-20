import type { Plugin } from 'vite';

/** Dev server only: lets the creator replace a pack level's code in src/levels.ts. */
export function levelsWriter(): Plugin;
