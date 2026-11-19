import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 1', () => collect(1, 8));
