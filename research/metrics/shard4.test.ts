import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 4', () => collect(4, 8));
