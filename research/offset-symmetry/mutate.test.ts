import { test } from 'vitest';
import { mutate } from './tiles';

// One mutate process. Several run side by side with different RUN numbers, each writing its own files, e.g.
//   RUN=1 RESEARCH_MINUTES=30 npx vitest run --config research/vitest.config.ts research/offset-symmetry/mutate.test.ts
test('offset symmetry mutate', () => {
  mutate(Number(process.env.RUN ?? 1));
});
