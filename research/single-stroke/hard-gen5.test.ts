import { test } from 'vitest';
import { generatedHard } from './search';

test('hard single strokes, generated, run 5', () => generatedHard(5));
