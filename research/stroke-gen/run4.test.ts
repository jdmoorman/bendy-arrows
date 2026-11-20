import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 4', () => strokeGen(4));
