/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import type { LogicOptions, RuleId } from './logic';
import { suggestWall, type WallSuggestion } from './suggest';

export type SuggestRequest = { code: string; rules: RuleId[]; opts?: LogicOptions };
export type SuggestMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; suggestion: WallSuggestion | null }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Work out the editor's suggested wall off the main thread, reporting progress as it goes. */
ctx.onmessage = (ev: MessageEvent<SuggestRequest>) => {
  try {
    const { code, rules, opts } = ev.data;
    let last = 0;
    const suggestion = suggestWall(decodePuzzle(code), rules, opts, (done, total) => {
      // A few dozen updates are plenty for a progress bar.
      if (done === total || done - last >= Math.max(1, Math.floor(total / 50))) {
        last = done;
        ctx.postMessage({ type: 'progress', done, total } satisfies SuggestMessage);
      }
    });
    ctx.postMessage({ type: 'done', suggestion } satisfies SuggestMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SuggestMessage);
  }
};
