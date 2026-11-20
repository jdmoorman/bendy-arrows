import { test } from 'vitest';
import { tilesGen } from './build';

test('black-tile strokes, build run 7', () => tilesGen(7));
