import { test } from 'vitest';
import { tilesGen } from './build';

test('black-tile strokes, build run 4', () => tilesGen(4));
