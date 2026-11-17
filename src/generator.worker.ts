/// <reference lib="webworker" />
import { encodePuzzle } from './codec';
import { generate, type Difficulty, type GenOptions } from './generator';

export type GeneratorMessage =
  | { type: 'progress'; attempt: number }
  | { type: 'done'; code: string; difficulty: Difficulty; attempts: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<GenOptions>) => {
  try {
    const r = generate(ev.data, (attempt) => ctx.postMessage({ type: 'progress', attempt } satisfies GeneratorMessage));
    ctx.postMessage({ type: 'done', code: encodePuzzle(r.puzzle), difficulty: r.difficulty, attempts: r.attempts } satisfies GeneratorMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies GeneratorMessage);
  }
};
