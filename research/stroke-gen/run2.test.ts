import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 2', () => strokeGen(2));
