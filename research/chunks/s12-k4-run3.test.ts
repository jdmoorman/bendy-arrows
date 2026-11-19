import { test } from 'vitest';
import { chunkSearch } from './search';

test('chunks 12×12, 4×4 chunks, run 3', () => chunkSearch(12, 4, 3));
