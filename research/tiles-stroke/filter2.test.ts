import { test } from 'vitest';
import { tilesOnly } from '../single-stroke/search';

test('black-tile strokes, filter run 2', () => tilesOnly(2));
