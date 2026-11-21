import { test } from 'vitest';
import { hardWalls } from './search';

test('hard one-shots with walls, run 3', () => hardWalls(3));
