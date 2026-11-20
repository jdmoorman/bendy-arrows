import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 6', () => strokeGen(6));
