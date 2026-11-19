import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 4', () => searchOneObstacle(4, 8));
