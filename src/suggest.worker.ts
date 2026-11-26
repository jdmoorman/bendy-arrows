/// <reference lib="webworker" />
import { decodePuzzle } from './codec';
import type { LogicOptions, RuleId } from './logic';
import { finishChanges, scoreChanges, suggest, type SuggestKind, type Suggestion, type TileScore } from './suggest';

/**
 * Work for the editor's Suggest, off the main thread:
 *  - suggest: the whole search in this one worker;
 *  - score: play some sets of changes through (the editor splits these across several workers);
 *  - finish: pick the change from every score (see finishChanges).
 */
export type SuggestRequest =
  | { task: 'suggest'; code: string; kind: SuggestKind; rules: RuleId[]; opts?: LogicOptions; drawn?: number[] }
  | { task: 'score'; code: string; kind: SuggestKind; sets: number[][]; rules: RuleId[]; opts?: LogicOptions }
  | {
      task: 'finish';
      code: string;
      kind: SuggestKind;
      candidates: number[];
      singles: TileScore[];
      pairs: [string, TileScore | null][];
      rules: RuleId[];
      opts?: LogicOptions;
      /** Lines drawn in the editor: the change picked must leave a solution using them all. */
      drawn?: number[];
    };
export type SuggestMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'scores'; scores: (TileScore | null)[] }
  | { type: 'done'; suggestion: Suggestion | null }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<SuggestRequest>) => {
  try {
    const m = ev.data;
    const p = decodePuzzle(m.code);
    const opts = m.opts ?? {};
    if (m.task === 'score') {
      let done = 0;
      const scores = scoreChanges(p, m.kind, m.sets, m.rules, opts, () => ctx.postMessage({ type: 'progress', done: ++done, total: m.sets.length } satisfies SuggestMessage));
      ctx.postMessage({ type: 'scores', scores } satisfies SuggestMessage);
      return;
    }
    if (m.task === 'finish') {
      ctx.postMessage({ type: 'done', suggestion: finishChanges(p, m.kind, m.candidates, m.singles, new Map(m.pairs), m.rules, opts, m.drawn) } satisfies SuggestMessage);
      return;
    }
    let last = 0;
    const suggestion = suggest(p, m.kind, m.rules, opts, (done, total) => {
      // A few dozen updates are plenty for a progress bar.
      if (done === total || done - last >= Math.max(1, Math.floor(total / 50))) {
        last = done;
        ctx.postMessage({ type: 'progress', done, total } satisfies SuggestMessage);
      }
    }, m.drawn);
    ctx.postMessage({ type: 'done', suggestion } satisfies SuggestMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies SuggestMessage);
  }
};
