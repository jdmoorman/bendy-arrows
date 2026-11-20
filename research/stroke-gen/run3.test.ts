import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 3', () => strokeGen(3));
