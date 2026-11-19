import { test } from 'vitest';
import { collect } from './collect';

test('metrics shard 6', () => collect(6, 8));
