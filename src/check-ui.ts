import { encodePuzzle } from './codec';
import type { EditorView } from './editor';
import { missingEnds } from './rules';
import type { RatingMessage, RatingRequest } from './rating.worker';
import { endPlacementsInBackground, solutionUnionInBackground, solveInBackground, type EndsRun, type SolverRun, type UnionRun } from './solver-client';
import type { SolveResult } from './solver';

/** Pause after the last edit before checking, so quick edits don't start many searches. */
const DEBOUNCE_MS = 350;

/**
 * Keeps the editor's puzzle checked for a solution and for uniqueness in the
 * background. Under the board: whether it's unique (or has no or several
 * solutions), and the solution overlay always shows: the solution of a unique
 * puzzle, or every line that some solution uses.
 */
export function attachUniquenessCheck(editor: EditorView): void {

  let run: SolverRun | null = null;
  let union: UnionRun | null = null;
  let ends: EndsRun | null = null;
  let timer = 0;
  let last: SolveResult | null = null;

  // Under the board: whether the puzzle is unique, and for a unique one how many hints a player
  // alternating easy rules and hints would need, worked out in the background.
  const info = document.createElement('div');
  info.className = 'rating-info';
  info.setAttribute('role', 'status');
  const state = document.createElement('span');
  state.className = 'validity';
  const hints = document.createElement('span');
  hints.className = 'hint-count hidden';
  info.append(state, hints);
  // Running locally: copy the puzzle as a line for src/levels.ts, once it's unique and rated.
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'link-btn copy-level hidden';
  copyBtn.textContent = 'Copy level entry';
  let entry = '';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(entry);
      editor.setMessage('Copied. Paste it into a pack’s levels in src/levels.ts.', 'success');
    } catch {
      // No clipboard (e.g. a phone on the dev server over plain http): show it to copy by hand.
      window.prompt('Copy this line into a pack’s levels in src/levels.ts.', entry);
    }
  });
  if (import.meta.env.DEV) info.append(copyBtn);
  editor.el.querySelector('.board-info')!.append(info);
  let rater: Worker | null = null;
  const stopRating = () => {
    rater?.terminate();
    rater = null;
    hints.classList.add('hidden');
    copyBtn.classList.add('hidden');
  };
  const rate = () => {
    stopRating();
    if (last?.status !== 'unique') return;
    copyBtn.classList.add('hidden');
    hints.textContent = 'Counting hints…';
    hints.classList.remove('hidden');
    const worker = new Worker(new URL('./rating.worker.ts', import.meta.url), { type: 'module' });
    rater = worker;
    worker.onmessage = (ev: MessageEvent<RatingMessage>) => {
      if (rater !== worker) return;
      worker.terminate();
      rater = null;
      if (!ev.data.rating.unique) return hints.classList.add('hidden');
      const n = ev.data.rating.hints ?? 0;
      const count = n ? `${n} hint${n === 1 ? '' : 's'}` : 'No hints';
      hints.textContent = ev.data.rating.hintsStuck ? `${count}, then stuck` : count;
      const p = editor.current;
      entry = `      '${ev.data.code}', // ${hints.textContent} ${p.w}×${p.h}`;
      copyBtn.classList.remove('hidden');
    };
    worker.postMessage([encodePuzzle(editor.current)] satisfies RatingRequest);
  };

  const setChip = (kind: 'checking' | 'unique' | 'none' | 'multiple' | 'aborted', label: string) => {
    state.dataset.state = kind;
    state.textContent = label;
  };
  const refreshChip = () => {
    if (!last) return setChip('checking', 'Checking…');
    if (last.status === 'unique') setChip('unique', 'Unique');
    else if (last.status === 'none') setChip('none', 'No solution');
    else if (last.status === 'multiple') setChip('multiple', 'Multiple solutions');
    else setChip('aborted', 'Too big');
  };

  /** Show (or hide) the overlay for the latest result. */
  const overlay = () => {
    union?.cancel();
    union = null;
    editor.suggestWall(null);
    if (!last || (last.status !== 'unique' && last.status !== 'multiple')) return editor.showGhost(null);
    // Show the solutions found so far at once, then every line any solution uses as it's found.
    editor.showGhost(last.solutions.flat());
    if (last.status !== 'multiple') return;
    const thisRun = solutionUnionInBackground(editor.current, (edges) => {
      if (union === thisRun) editor.showGhost(edges);
    });
    union = thisRun;
    thisRun.result.then(
      (r) => {
        if (union !== thisRun) return;
        union = null;
        editor.showGhost(r.edges);
        // Suggest the wall that rules out the most solutions found (dashed on the board).
        const s = r.suggestedWall;
        editor.suggestWall(s ? s.edge : null);
        const n = r.unchecked.length;
        const unchecked = n ? ` (${n} border${n === 1 ? '' : 's'} too slow to check.)` : '';
        if (s) editor.setMessage(`Suggested wall (dashed): it rules out ${s.rulesOut} of the ${s.found} solutions found.${unchecked}`, 'error');
        else if (n) editor.setMessage(`Showing every line some solution uses.${unchecked}`, 'error');
      },
      () => {},
    );
  };

  /**
   * Short of ends: look for where they could go. Each frame spot that gives a solution gets a dot
   * (green: only one solution; amber: several), and the line under the board counts them.
   */
  const findEnds = async () => {
    const p = editor.current;
    const missing = p.endpoints.length === 0 ? 'both ends' : 'the other end';
    const marks = new Map<number, 'unique' | 'multiple'>();
    // Every line some solution uses, whichever working placement it's for.
    const lines = new Set<number>();
    let pairs = 0;
    let unique = 0;
    const show = (done: boolean) => {
      editor.showEndOptions(marks.size ? new Map(marks) : null);
      const counts = `${pairs} placement${pairs === 1 ? '' : 's'} work${pairs === 1 ? 's' : ''}${unique ? ` (${unique} unique)` : ''}`;
      if (!done) setChip('checking', pairs ? `Finding ends… ${counts}` : 'Finding ends…');
      else if (pairs) setChip(unique ? 'unique' : 'multiple', `No ${missing === 'both ends' ? 'ends' : 'second end'}: ${counts}`);
      else setChip('none', `No ${missing === 'both ends' ? 'ends' : 'second end'}: no placement has a solution`);
    };
    show(false);
    const thisRun = endPlacementsInBackground(p, (o) => {
      if (ends !== thisRun) return;
      pairs++;
      if (o.status === 'unique') unique++;
      // Mark every new end's spot, the better verdict winning (one solution beats several).
      for (const port of p.endpoints.length ? o.ports[1] : o.ports.flat()) if (marks.get(port) !== 'unique') marks.set(port, o.status);
      for (const e of o.edges) lines.add(e);
      editor.showGhost(lines);
      show(false);
    });
    ends = thisRun;
    try {
      await thisRun.result;
      if (ends !== thisRun) return;
      ends = null;
      show(true);
    } catch (err) {
      if (ends !== thisRun) return;
      ends = null;
      if ((err as Error).name !== 'AbortError') setChip('aborted', 'Error');
    }
  };

  const start = async () => {
    // Short of ends: find where they could go instead.
    if (missingEnds(editor.current)) return findEnds();
    const thisRun = solveInBackground(editor.current);
    run = thisRun;
    try {
      const r = await thisRun.result;
      if (run !== thisRun) return;
      run = null;
      last = r;
      refreshChip();
      overlay();
      rate();
    } catch (err) {
      if (run !== thisRun) return;
      run = null;
      if ((err as Error).name !== 'AbortError') setChip('aborted', 'Error');
    }
  };

  // Re-check after every change to the puzzle; the old overlay no longer fits.
  editor.changeListeners.push(() => {
    run?.cancel();
    run = null;
    union?.cancel();
    union = null;
    ends?.cancel();
    ends = null;
    editor.showEndOptions(null);
    last = null;
    editor.showGhost(null);
    editor.suggestWall(null);
    stopRating();
    refreshChip();
    clearTimeout(timer);
    timer = window.setTimeout(start, DEBOUNCE_MS);
  });


  refreshChip();
}
