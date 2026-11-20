import { test } from 'vitest';
import { existing } from './search';

test('single-stroke puzzles among those on hand', () => existing());
