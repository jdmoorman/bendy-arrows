import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse path 10×10', () => hardSparse(10, 10));
