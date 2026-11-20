import { test } from 'vitest';
import { tilesGen } from './build';

test('black-tile strokes, build run 5', () => tilesGen(5));
