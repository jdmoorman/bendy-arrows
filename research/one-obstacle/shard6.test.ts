import { test } from 'vitest';
import { searchOneObstacle } from './search';

test('one obstacle, shard 6', () => searchOneObstacle(6, 8));
