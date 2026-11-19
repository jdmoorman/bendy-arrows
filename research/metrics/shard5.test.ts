import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 5', () => collect(5, 8));
