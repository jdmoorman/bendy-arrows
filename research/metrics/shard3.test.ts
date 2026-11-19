import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 3', () => collect(3, 8));
