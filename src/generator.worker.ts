/// <reference lib="webworker" />
import { decodePuzzle, encodePuzzle } from './codec';
import { generate, simplifyPuzzle, type Difficulty, type GenOptions } from './generator';

export type GeneratorMessage =
  | { type: 'progress'; attempt: number }
  | { type: 'done'; code: string; difficulty: Difficulty; attempts: number }
  | { type: 'simplified'; code: string | null }
  | { type: 'error'; message: string };

/** Generate a puzzle, or simplify one (its code, and a seed for the order obstacles are tried in). */
export type GeneratorRequest = GenOptions | { simplify: string; seed: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<GeneratorRequest>) => {
  try {
    if ('simplify' in ev.data) {
      const q = simplifyPuzzle(decodePuzzle(ev.data.simplify), ev.data.seed);
      ctx.postMessage({ type: 'simplified', code: q && encodePuzzle(q) } satisfies GeneratorMessage);
      return;
    }
    const r = generate(ev.data, (attempt) => ctx.postMessage({ type: 'progress', attempt } satisfies GeneratorMessage));
    ctx.postMessage({ type: 'done', code: encodePuzzle(r.puzzle), difficulty: r.difficulty, attempts: r.attempts } satisfies GeneratorMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies GeneratorMessage);
  }
};
