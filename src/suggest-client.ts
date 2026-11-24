import { encodePuzzle } from './codec';
import type { LogicOptions, RuleId } from './logic';
import type { Puzzle } from './model';
import { keepSingles, pairMap, tileCandidates, tilePairs, type SuggestKind, type Suggestion, type TileScore } from './suggest';
import type { SuggestMessage, SuggestRequest } from './suggest.worker';

export interface SuggestRun {
  result: Promise<Suggestion | null>;
  cancel(): void;
}

/** Workers for black tiles: one per core but one (for the page), at least one and at most eight. */
const WORKERS = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1));

const newWorker = () => new Worker(new URL('./suggest.worker.ts', import.meta.url), { type: 'module' });

/** One request to a worker: its last message, with progress (items done) reported on the way. */
function ask(worker: Worker, req: SuggestRequest, onProgress?: (done: number) => void): Promise<SuggestMessage> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<SuggestMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') return onProgress?.(m.done);
      if (m.type === 'error') reject(new Error(m.message));
      else resolve(m);
    };
    worker.onerror = (ev) => reject(new Error(ev.message || 'Suggest failed.'));
    worker.postMessage(req);
  });
}

/**
 * The editor's suggested wall or black tile, worked out in background workers; `onProgress` sees
 * how far it is (0 to 1). Black tiles are split across several workers (see suggestTiles for the
 * search): first every single tile, then every pair, then one worker picks.
 */
export function suggestInBackground(p: Puzzle, kind: SuggestKind, rules: RuleId[], opts: LogicOptions, onProgress: (fraction: number) => void): SuggestRun {
  const code = encodePuzzle(p);
  const workers: Worker[] = [];
  let cancelled = false;
  const stop = () => workers.forEach((w) => w.terminate());
  const run = async (): Promise<Suggestion | null> => {
    if (kind === 'wall') {
      workers.push(newWorker());
      const m = await ask(workers[0], { task: 'suggest', code, kind, rules, opts }, (done) => onProgress(done / 1000));
      return m.type === 'done' ? m.suggestion : null;
    }
    for (let i = 0; i < WORKERS; i++) workers.push(newWorker());
    /** Score sets of tiles across the workers, keeping their order; progress runs from `from` to `to`. */
    const score = async (sets: number[][], from: number, to: number) => {
      const chunks = workers.map((_, i) => sets.filter((_, k) => k % workers.length === i));
      const done = workers.map(() => 0);
      const results = await Promise.all(
        workers.map((w, i) =>
          ask(w, { task: 'score', code, sets: chunks[i], rules, opts }, (d) => {
            done[i] = d;
            onProgress(from + ((to - from) * done.reduce((a, b) => a + b, 0)) / Math.max(1, sets.length));
          }),
        ),
      );
      if (cancelled) throw new DOMException('Cancelled', 'AbortError');
      const out: (TileScore | null)[] = new Array(sets.length);
      results.forEach((m, i) => {
        if (m.type !== 'scores') return;
        m.scores.forEach((s, k) => (out[k * workers.length + i] = s));
      });
      return out;
    };
    const candidates = tileCandidates(p);
    const singles = keepSingles(await score(candidates.map((c) => [c]), 0, 0.1));
    const pairs = tilePairs(p, singles, candidates);
    const pairScores = pairMap(pairs, await score(pairs, 0.1, 0.95));
    const m = await ask(workers[0], { task: 'finish', code, candidates, singles, pairs: [...pairScores], rules, opts });
    onProgress(1);
    return m.type === 'done' ? m.suggestion : null;
  };
  // Cancelling stops the workers (whose replies then never come) and settles the result at once.
  let abort!: (e: Error) => void;
  const aborted = new Promise<never>((_, reject) => (abort = reject));
  const result = Promise.race([run(), aborted]).finally(stop);
  return {
    result,
    cancel() {
      cancelled = true;
      stop();
      abort(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
