import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse loop 8×8', () => hardSparse('loop', 8, 8));
