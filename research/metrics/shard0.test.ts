import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 0', () => collect(0, 8));
