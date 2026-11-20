import { test } from 'vitest';
import { strokeGen } from './generate';

test('built single strokes, run 1', () => strokeGen(1));
