import { test } from 'vitest';
import { hardWalls } from './search';

test('hard one-shots with walls, run 4', () => hardWalls(4));
