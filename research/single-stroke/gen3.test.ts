import { test } from 'vitest';
import { generated } from './search';

test('single-stroke puzzles, generated, run 3', () => generated(3));
