import { encodePuzzle } from './codec';
import type { LogicOptions, RuleId } from './logic';
import type { Puzzle } from './model';
import type { WallSuggestion } from './suggest';
import type { SuggestMessage, SuggestRequest } from './suggest.worker';

export interface SuggestRun {
  result: Promise<WallSuggestion | null>;
  cancel(): void;
}

/** The editor's suggested wall, worked out in a background worker; `onProgress` sees how far it is (0 to 1). */
export function suggestWallInBackground(p: Puzzle, rules: RuleId[], opts: LogicOptions, onProgress: (fraction: number) => void): SuggestRun {
  const worker = new Worker(new URL('./suggest.worker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (r: WallSuggestion | null) => void; reject: (e: Error) => void };
  const result = new Promise<WallSuggestion | null>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<SuggestMessage>) => {
    const m = ev.data;
    if (m.type === 'progress') return onProgress(m.total ? m.done / m.total : 1);
    worker.terminate();
    if (m.type === 'done') settle.resolve(m.suggestion);
    else settle.reject(new Error(m.message));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Suggest failed.'));
  };
  worker.postMessage({ code: encodePuzzle(p), rules, opts } satisfies SuggestRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
