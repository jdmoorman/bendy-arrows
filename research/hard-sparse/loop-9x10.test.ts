import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse loop 9×10', () => hardSparse('loop', 9, 10));
