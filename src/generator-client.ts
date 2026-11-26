import { decodePuzzle, encodePuzzle } from './codec';
import { type Difficulty, type GenOptions, type FillResult, type GoalFailure, type SimplifyGoal } from './generator';
import type { LogicOptions, RuleId } from './logic';
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
    if (m.type === 'removable' || m.type === 'simplified' || m.type === 'filled') settle.reject(new Error('Unexpected reply.'));
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

/** One request to a fresh worker, its single reply turned into a result by `read` (null: unexpected). */
function askWorker<T>(req: GeneratorRequest, read: (m: GeneratorMessage) => T | undefined, failed: string): { result: Promise<T>; cancel(): void } {
  const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  let settle!: { resolve: (r: T) => void; reject: (e: Error) => void };
  const result = new Promise<T>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<GeneratorMessage>) => {
    const m = ev.data;
    worker.terminate();
    const r = read(m);
    if (r !== undefined) settle.resolve(r);
    else settle.reject(new Error(m.type === 'error' ? m.message : 'Unexpected reply.'));
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || failed));
  };
  worker.postMessage(req);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

/** What could go: walls and black tiles one at a time, and pairs of black tiles together. */
export type Removable = { walls: Set<number>; blocked: Set<number>; pairs: [number, number][] };

/**
 * The walls and black tiles a puzzle could lose one at a time and still meet the Simplify goal,
 * found in a background worker; or why the puzzle doesn't meet it to begin with. `rules`: for
 * 'easy', the rules that must solve it (the easy rules by default).
 */
export function removableInBackground(p: Puzzle, goal: SimplifyGoal, opts: LogicOptions, rules?: RuleId[]): { result: Promise<Removable | GoalFailure>; cancel(): void } {
  return askWorker<Removable | GoalFailure>(
    { removable: encodePuzzle(p), goal, opts, rules },
    (m) => (m.type !== 'removable' ? undefined : 'failure' in m ? m.failure : { walls: new Set(m.walls), blocked: new Set(m.blocked), pairs: m.pairs }),
    'Checking the obstacles failed.',
  );
}

/**
 * The puzzle with a wall on every border no solution through the drawn lines crosses (or why
 * there's no such solution), in a background worker.
 */
export function fillInBackground(p: Puzzle, drawn: Iterable<number>): { result: Promise<FillResult | 'none' | 'aborted'>; cancel(): void } {
  return askWorker<FillResult | 'none' | 'aborted'>(
    { fill: encodePuzzle(p), drawn: [...drawn] },
    (m) => (m.type !== 'filled' ? undefined : 'failure' in m ? m.failure : { puzzle: decodePuzzle(m.code), status: m.status, unchecked: m.unchecked }),
    'Filling failed.',
  );
}

/** The puzzle with every obstacle the Simplify goal doesn't need taken away, in a background worker. */
export function simplifyInBackground(p: Puzzle, goal: SimplifyGoal, opts: LogicOptions): { result: Promise<Puzzle | GoalFailure>; cancel(): void } {
  return askWorker<Puzzle | GoalFailure>(
    { simplify: encodePuzzle(p), goal, seed: Math.floor(Math.random() * 2 ** 31), opts },
    (m) => (m.type !== 'simplified' ? undefined : 'failure' in m ? m.failure : decodePuzzle(m.code)),
    'Simplifying failed.',
  );
}
