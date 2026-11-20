import { test } from 'vitest';
import { tilesOnly } from '../single-stroke/search';

test('black-tile strokes, filter run 3', () => tilesOnly(3));
