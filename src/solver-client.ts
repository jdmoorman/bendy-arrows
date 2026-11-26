import { encodePuzzle } from './codec';
import type { LogicCheck } from './logic';
import type { Puzzle } from './model';
import type { EndFix, EndOption, SolveResult, TileFix, UnionResult } from './solver';
import type { SolverMessage, SolverRequest } from './solver.worker';

export interface SolverRun {
  result: Promise<SolveResult>;
  cancel(): void;
}

/** Solve in a background worker so the page stays responsive. */
export function solveInBackground(p: Puzzle, onProgress?: (nodes: number) => void, opts: Omit<SolverRequest, 'code'> = {}): SolverRun {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let settle: { resolve: (r: SolveResult) => void; reject: (e: Error) => void };
  const result = new Promise<SolveResult>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<SolverMessage>) => {
    const m = ev.data;
    if (m.type === 'progress') onProgress?.(m.nodes);
    else if (m.type === 'done') {
      worker.terminate();
      settle.resolve(m.result);
    } else if (m.type === 'error') {
      worker.terminate();
      settle.reject(new Error(m.message));
    }
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Solver failed.'));
  };
  worker.postMessage({ code: encodePuzzle(p), ...opts } satisfies SolverRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

export interface UnionRun {
  result: Promise<UnionResult>;
  cancel(): void;
}

/** Every line used by at least one solution, in a background worker; `onUpdate` sees it grow. */
export function solutionUnionInBackground(p: Puzzle, onUpdate: (edges: number[]) => void): UnionRun {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let settle: { resolve: (r: UnionResult) => void; reject: (e: Error) => void };
  const result = new Promise<UnionResult>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<SolverMessage>) => {
    const m = ev.data;
    if (m.type === 'union') onUpdate(m.edges);
    else if (m.type === 'union-done') {
      worker.terminate();
      settle.resolve(m.result);
    } else if (m.type === 'error') {
      worker.terminate();
      settle.reject(new Error(m.message));
    }
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Solver failed.'));
  };
  worker.postMessage({ code: encodePuzzle(p), union: true } satisfies SolverRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

export interface EndsRun {
  result: Promise<{ options: EndOption[]; unchecked: number }>;
  cancel(): void;
}

/** For a puzzle short of ends, the end placements that give it a solution, in a background worker; `onFound` sees each. */
export function endPlacementsInBackground(p: Puzzle, onFound: (o: EndOption) => void, check?: LogicCheck): EndsRun {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let settle: { resolve: (r: { options: EndOption[]; unchecked: number }) => void; reject: (e: Error) => void };
  const result = new Promise<{ options: EndOption[]; unchecked: number }>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<SolverMessage>) => {
    const m = ev.data;
    if (m.type === 'end') onFound(m.option);
    else if (m.type === 'ends-done') {
      worker.terminate();
      settle.resolve({ options: m.options, unchecked: m.unchecked });
    } else if (m.type === 'error') {
      worker.terminate();
      settle.reject(new Error(m.message));
    }
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Solver failed.'));
  };
  worker.postMessage({ code: encodePuzzle(p), ends: true, check } satisfies SolverRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

export interface FixesRun {
  result: Promise<{ fixes: TileFix[]; endFixes: EndFix[] }>;
  cancel(): void;
}

/**
 * For a puzzle with no solution, in a background worker: the one-tile changes among `cells` that
 * give it one (`onFound` sees each), then the ends that could move (or be placed) to give it one.
 */
export function tileFixesInBackground(p: Puzzle, cells: number[], onFound: (f: TileFix) => void, check?: LogicCheck): FixesRun {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let settle: { resolve: (r: { fixes: TileFix[]; endFixes: EndFix[] }) => void; reject: (e: Error) => void };
  const result = new Promise<{ fixes: TileFix[]; endFixes: EndFix[] }>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (ev: MessageEvent<SolverMessage>) => {
    const m = ev.data;
    if (m.type === 'fix') onFound(m.fix);
    else if (m.type === 'fixes-done') {
      worker.terminate();
      settle.resolve({ fixes: m.fixes, endFixes: m.endFixes });
    } else if (m.type === 'error') {
      worker.terminate();
      settle.reject(new Error(m.message));
    }
  };
  worker.onerror = (ev) => {
    worker.terminate();
    settle.reject(new Error(ev.message || 'Solver failed.'));
  };
  worker.postMessage({ code: encodePuzzle(p), fixes: cells, check } satisfies SolverRequest);
  return {
    result,
    cancel() {
      worker.terminate();
      settle.reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
