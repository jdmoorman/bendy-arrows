import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 5', () => searchOneObstacle(5, 8));
