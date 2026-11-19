import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 2', () => searchOneObstacle(2, 8));
