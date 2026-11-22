import { test } from 'vitest';
import { grow } from './grow';

// One grow process. Several run side by side with different RUN numbers, each writing its own files, e.g.
//   RUN=1 RESEARCH_MINUTES=30 npx vitest run --config research/vitest.config.ts research/offset-symmetry/grow.test.ts
test('offset symmetry grow', () => {
  grow(Number(process.env.RUN ?? 1));
});
