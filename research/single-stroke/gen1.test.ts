import { test } from 'vitest';
import { generated } from './search';

test('single-stroke puzzles, generated, run 1', () => generated(1));
