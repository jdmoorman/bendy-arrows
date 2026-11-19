import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 7', () => collect(7, 8));
