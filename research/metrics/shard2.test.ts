import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 2', () => collect(2, 8));
