import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 7', () => searchOneObstacle(7, 8));
