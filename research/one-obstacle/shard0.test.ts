import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 0', () => searchOneObstacle(0, 8));
