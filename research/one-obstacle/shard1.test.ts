import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 1', () => searchOneObstacle(1, 8));
