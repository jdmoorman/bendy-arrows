/// <reference lib="webworker" />
import { decodePuzzle, encodePuzzle } from './codec';
import { fillWalls, generate, goalFailure, removableObstacles, simplifyPuzzle, type Difficulty, type GenOptions, type GoalFailure, type SimplifyGoal } from './generator';
import type { LogicOptions } from './logic';

export type GeneratorMessage =
  | { type: 'progress'; attempt: number }
  | { type: 'done'; code: string; difficulty: Difficulty; attempts: number }
  | { type: 'removable'; walls: number[]; blocked: number[] }
  | { type: 'removable'; failure: GoalFailure }
  | { type: 'simplified'; code: string }
  | { type: 'simplified'; failure: GoalFailure }
  | { type: 'filled'; code: string; status: 'unique' | 'multiple'; unchecked: number }
  | { type: 'filled'; failure: 'none' | 'aborted' }
  | { type: 'error'; message: string };

/**
 * Generate a puzzle; find the obstacles a puzzle (its code) could lose one at a time and still
 * meet a Simplify goal; take away every obstacle the goal doesn't need; or wall off every
 * border the unique solution doesn't cross.
 */
export type GeneratorRequest =
  | GenOptions
  | { removable: string; goal: SimplifyGoal; opts: LogicOptions }
  | { simplify: string; goal: SimplifyGoal; seed: number; opts: LogicOptions }
  | { fill: string; drawn: number[] };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<GeneratorRequest>) => {
  try {
    const d = ev.data;
    if ('fill' in d) {
      const q = fillWalls(decodePuzzle(d.fill), d.drawn);
      ctx.postMessage((typeof q === 'string' ? { type: 'filled', failure: q } : { type: 'filled', code: encodePuzzle(q.puzzle), status: q.status, unchecked: q.unchecked }) satisfies GeneratorMessage);
      return;
    }
    if ('removable' in d || 'simplify' in d) {
      const p = decodePuzzle('removable' in d ? d.removable : d.simplify);
      const failure = goalFailure(p, d.goal, d.opts);
      if ('removable' in d) {
        const r = failure ? null : removableObstacles(p, d.goal, d.opts);
        ctx.postMessage((r ? { type: 'removable', ...r } : { type: 'removable', failure: failure ?? 'not unique' }) satisfies GeneratorMessage);
      } else {
        const q = failure ? null : simplifyPuzzle(p, d.seed, d.goal, d.opts);
        ctx.postMessage((q ? { type: 'simplified', code: encodePuzzle(q) } : { type: 'simplified', failure: failure ?? 'not unique' }) satisfies GeneratorMessage);
      }
      return;
    }
    const r = generate(d, (attempt) => ctx.postMessage({ type: 'progress', attempt } satisfies GeneratorMessage));
    ctx.postMessage({ type: 'done', code: encodePuzzle(r.puzzle), difficulty: r.difficulty, attempts: r.attempts } satisfies GeneratorMessage);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies GeneratorMessage);
  }
};
