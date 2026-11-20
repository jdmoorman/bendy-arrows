import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 5', () => strokeGen(5));
