import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse loop 10×10', () => hardSparse('loop', 10, 10));
