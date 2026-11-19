import { decodePuzzle, encodePuzzle } from './codec';
import { randomSeed, type Difficulty, type GenOptions } from './generator';
import type { GeneratorMessage, GeneratorRequest } from './generator.worker';
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
    if (m.type === 'simplified') settle.reject(new Error('Unexpected reply.'));
    else if (m.type === 'done') settle.resolve({ puzzle: decodePuzzle(m.code), difficulty: m.difficulty });
    else settle.reject(new Error(m.message));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'The generator failed.'));
  };
  worker.postMessage(opts satisfies GeneratorRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

/**
 * Take away the obstacles the unique solution doesn't need, in random order, in a background
 * worker. Resolves to null if the puzzle doesn't have exactly one solution.
 */
export function simplifyInBackground(p: Puzzle): { result: Promise<Puzzle | null>; cancel(): void } {
  const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (p: Puzzle | null) => void; reject: (e: Error) => void };
  const result = new Promise<Puzzle | null>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<GeneratorMessage>) => {
    const m = ev.data;
    worker.terminate();
    if (m.type === 'simplified') settle.resolve(m.code === null ? null : decodePuzzle(m.code));
    else settle.reject(new Error(m.type === 'error' ? m.message : 'Unexpected reply.'));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Simplifying failed.'));
  };
  worker.postMessage({ simplify: encodePuzzle(p), seed: randomSeed() } satisfies GeneratorRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
