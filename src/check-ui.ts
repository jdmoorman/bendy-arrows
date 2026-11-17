import type { EditorView } from './editor';
import { solutionUnionInBackground, solveInBackground, type SolverRun, type UnionRun } from './solver-client';
import type { SolveResult } from './solver';
import { Storage } from './storage';

/** Pause after the last edit before checking, so quick edits don't start many searches. */
const DEBOUNCE_MS = 350;

/**
 * Keeps the editor's puzzle checked for a solution and for uniqueness in the
 * background. The status chip also switches the solution overlay on and off:
 * the solution of a unique puzzle, or every line that some solution uses.
 * The choice is remembered, and the overlay follows the puzzle as it is edited.
 */
export function attachUniquenessCheck(editor: EditorView): void {
  const storage = new Storage();
  const chip = document.createElement('button');
  chip.className = 'btn validity';
  editor.actions.append(chip);

  let run: SolverRun | null = null;
  let union: UnionRun | null = null;
  let timer = 0;
  let last: SolveResult | null = null;
  let showing = storage.loadShowSolution();

  const setChip = (state: 'checking' | 'unique' | 'none' | 'multiple' | 'aborted', label: string) => {
    chip.dataset.state = state;
    chip.innerHTML = state === 'checking' ? `<span class="spinner" aria-hidden="true"></span><span>${label}</span>` : `<span>${label}</span>`;
    chip.setAttribute('aria-pressed', String(showing));
    chip.setAttribute('aria-label', `${state === 'checking' ? 'Checking the puzzle' : label}. ${showing ? 'Hide' : 'Show'} the solution lines.`);
  };
  const refreshChip = () => {
    if (!last) return setChip('checking', 'Checking');
    if (last.status === 'unique') setChip('unique', 'Unique');
    else if (last.status === 'none') setChip('none', 'No solution');
    else if (last.status === 'multiple') setChip('multiple', 'Multiple');
    else setChip('aborted', 'Too big');
  };

  /** Show (or hide) the overlay for the latest result. */
  const overlay = () => {
    union?.cancel();
    union = null;
    editor.suggestWall(null);
    if (!showing || !last || (last.status !== 'unique' && last.status !== 'multiple')) return editor.showGhost(null);
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

  const start = async () => {
    const thisRun = solveInBackground(editor.current);
    run = thisRun;
    try {
      const r = await thisRun.result;
      if (run !== thisRun) return;
      run = null;
      last = r;
      refreshChip();
      overlay();
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
    last = null;
    editor.showGhost(null);
    editor.suggestWall(null);
    refreshChip();
    clearTimeout(timer);
    timer = window.setTimeout(start, DEBOUNCE_MS);
  });

  chip.addEventListener('click', () => {
    showing = !showing;
    storage.saveShowSolution(showing);
    refreshChip();
    overlay();
    if (!last) return editor.setMessage(showing ? 'Checking the puzzle; the solution will show when it is done.' : 'Solution lines hidden.');
    if (!showing) return editor.setMessage(`Solution lines hidden. ${describe(last)}`, last.status === 'unique' ? 'success' : 'error');
    if (last.status === 'unique') return editor.setMessage('Showing the unique solution. Tap Unique again to hide it.', 'success');
    if (last.status === 'multiple') return editor.setMessage('More than one solution: showing every line that at least one of them uses.', 'error');
    editor.setMessage(describe(last), 'error');
  });

  refreshChip();
}

function describe(r: SolveResult): string {
  switch (r.status) {
    case 'unique':
      return 'Unique solution — ready to play and share.';
    case 'multiple':
      return 'More than one solution. Add walls, black tiles, ends or checkpoints to narrow it down.';
    case 'none':
      return `No solution. ${r.reason}`;
    case 'aborted':
      return `Gave up after ${r.nodes.toLocaleString()} steps — this puzzle is too big to check fully.`;
  }
}
