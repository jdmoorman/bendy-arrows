import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse path 10×10', () => hardSparse('path', 10, 10));
