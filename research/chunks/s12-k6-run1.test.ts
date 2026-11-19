import { test } from 'vitest';
import { chunkSearch } from './search';

test('chunks 12×12, 6×6 chunks, run 1', () => chunkSearch(12, 6, 1));
