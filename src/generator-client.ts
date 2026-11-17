import { decodePuzzle } from './codec';
import type { Difficulty, GenOptions } from './generator';
import type { GeneratorMessage } from './generator.worker';
import type { Puzzle } from './model';

export interface GeneratorRun {
  result: Promise<{ puzzle: Puzzle; difficulty: Difficulty }>;
  cancel(): void;
}

/** Generate a puzzle in a background worker so the page stays responsive. */
export function generateInBackground(opts: GenOptions, onProgress?: (attempt: number) => void): GeneratorRun {
  const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (r: { puzzle: Puzzle; difficulty: Difficulty }) => void; reject: (e: Error) => void };
  const result = new Promise<{ puzzle: Puzzle; difficulty: Difficulty }>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<GeneratorMessage>) => {
    const m = ev.data;
    if (m.type === 'progress') return onProgress?.(m.attempt);
    worker.terminate();
    if (m.type === 'done') settle.resolve({ puzzle: decodePuzzle(m.code), difficulty: m.difficulty });
    else settle.reject(new Error(m.message));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'The generator failed.'));
  };
  worker.postMessage(opts);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
