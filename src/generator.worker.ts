/// <reference lib="webworker" />
import { decodePuzzle, encodePuzzle } from './codec';
import { generate, removableObstacles, type Difficulty, type GenOptions } from './generator';

export type GeneratorMessage =
  | { type: 'progress'; attempt: number }
  | { type: 'done'; code: string; difficulty: Difficulty; attempts: number }
  | { type: 'removable'; walls: number[]; blocked: number[] } | { type: 'removable'; walls: null; blocked: null }
  | { type: 'error'; message: string };

/** Generate a puzzle, or find the obstacles a puzzle (its code) could lose one at a time. */
export type GeneratorRequest = GenOptions | { removable: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<GeneratorRequest>) => {
  try {
    if ('removable' in ev.data) {
      const r = removableObstacles(decodePuzzle(ev.data.removable));
      ctx.postMessage((r ? { type: 'removable', ...r } : { type: 'removable', walls: null, blocked: null }) satisfies GeneratorMessage);
      return;
    }
    const r = generate(ev.data, (attempt) => ctx.postMessage({ type: 'progress', attempt } satisfies GeneratorMessage));
    ctx.postMessage({ type: 'done', code: encodePuzzle(r.puzzle), difficulty: r.difficulty, attempts: r.attempts } satisfies GeneratorMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies GeneratorMessage);
  }
};
