import { test } from 'vitest';
import { chunkSearch } from './search';

test('chunks 10×10, 5×5 chunks, run 1', () => chunkSearch(10, 5, 1));
