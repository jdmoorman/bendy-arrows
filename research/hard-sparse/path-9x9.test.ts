import { test } from 'vitest';
import { hardSparse } from './search';

test('hard sparse path 9×9', () => hardSparse('path', 9, 9));
