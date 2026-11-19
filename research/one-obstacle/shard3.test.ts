import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 3', () => searchOneObstacle(3, 8));
