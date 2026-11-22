import { test } from 'vitest';
import { search } from './search';

// One search process. Several run side by side with different RUN numbers, each writing its own files, e.g.
//   RUN=1 RESEARCH_MINUTES=30 npx vitest run --config research/vitest.config.ts research/offset-symmetry/search.test.ts
test('offset symmetry search', () => {
  search(Number(process.env.RUN ?? 1));
});
