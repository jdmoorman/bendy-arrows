import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 7', () => strokeGen(7));
