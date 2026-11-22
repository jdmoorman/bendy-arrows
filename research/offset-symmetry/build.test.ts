import { test } from 'vitest';
import { build } from './tiles';

// One build process. Several run side by side with different RUN numbers, each writing its own files, e.g.
//   RUN=1 RESEARCH_MINUTES=30 npx vitest run --config research/vitest.config.ts research/offset-symmetry/build.test.ts
test('offset symmetry build', () => {
  build(Number(process.env.RUN ?? 1));
});
