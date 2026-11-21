import { decodePuzzle, encodePuzzle } from './codec';
import { type Difficulty, type GenOptions } from './generator';
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
    if (m.type === 'removable') settle.reject(new Error('Unexpected reply.'));
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
 * The walls and black tiles a puzzle could lose one at a time and keep exactly one solution,
 * found in a background worker. Resolves to null if it doesn't have exactly one solution.
 */
export function removableInBackground(p: Puzzle): { result: Promise<{ walls: Set<number>; blocked: Set<number> } | null>; cancel(): void } {
  const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (r: { walls: Set<number>; blocked: Set<number> } | null) => void; reject: (e: Error) => void };
  const result = new Promise<{ walls: Set<number>; blocked: Set<number> } | null>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<GeneratorMessage>) => {
    const m = ev.data;
    worker.terminate();
    if (m.type === 'removable') settle.resolve(m.walls ? { walls: new Set(m.walls), blocked: new Set(m.blocked) } : null);
    else settle.reject(new Error(m.type === 'error' ? m.message : 'Unexpected reply.'));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Checking the obstacles failed.'));
  };
  worker.postMessage({ removable: encodePuzzle(p) } satisfies GeneratorRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
