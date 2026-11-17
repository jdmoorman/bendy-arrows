import type { EditorView } from './editor';
import { ICONS } from './icons';
import { solveInBackground, type SolverRun } from './solver-client';
import type { SolveResult } from './solver';

/** Pause after the last edit before checking, so quick edits don't start many searches. */
const DEBOUNCE_MS = 350;

/**
 * Keeps the editor's puzzle checked for a solution and for uniqueness in the
 * background. A status chip shows the result (tap it for the explanation),
 * and an eye button overlays the solutions found.
 */
export function attachUniquenessCheck(editor: EditorView): void {
  const chip = document.createElement('button');
  chip.className = 'btn validity';
  const showBtn = document.createElement('button');
  showBtn.className = 'btn icon-only hidden';
  showBtn.setAttribute('aria-label', 'Show solution');
  showBtn.innerHTML = ICONS.eye;
  editor.actions.append(showBtn, chip);

  let run: SolverRun | null = null;
  let timer = 0;
  let last: SolveResult | null = null;
  let shown = -1;

  const setChip = (state: 'checking' | 'unique' | 'none' | 'multiple' | 'aborted', label: string) => {
    chip.dataset.state = state;
    chip.innerHTML = state === 'checking' ? `<span class="spinner" aria-hidden="true"></span><span>${label}</span>` : `<span>${label}</span>`;
    chip.setAttribute('aria-label', state === 'checking' ? 'Checking the puzzle' : `${label}: tap for details`);
  };

  const start = async () => {
    const thisRun = solveInBackground(editor.current);
    run = thisRun;
    try {
      const r = await thisRun.result;
      if (run !== thisRun) return;
      run = null;
      last = r;
      showBtn.classList.toggle('hidden', r.solutions.length === 0);
      if (r.status === 'unique') setChip('unique', 'Unique');
      else if (r.status === 'none') setChip('none', 'No solution');
      else if (r.status === 'multiple') setChip('multiple', '2+ solutions');
      else setChip('aborted', 'Too big');
    } catch (err) {
      if (run !== thisRun) return;
      run = null;
      if ((err as Error).name !== 'AbortError') setChip('aborted', 'Error');
    }
  };

  // Re-check after every change to the puzzle.
  editor.changeListeners.push(() => {
    run?.cancel();
    run = null;
    last = null;
    shown = -1;
    showBtn.classList.add('hidden');
    showBtn.setAttribute('aria-pressed', 'false');
    setChip('checking', 'Checking');
    clearTimeout(timer);
    timer = window.setTimeout(start, DEBOUNCE_MS);
  });

  chip.addEventListener('click', () => {
    if (!last) return editor.setMessage('Checking whether the puzzle has exactly one solution…');
    editor.setMessage(describe(last), last.status === 'unique' ? 'success' : 'error');
  });

  showBtn.addEventListener('click', () => {
    if (!last) return;
    shown = shown + 1 >= last.solutions.length ? -1 : shown + 1;
    editor.showGhost(shown >= 0 ? last.solutions[shown] : null);
    showBtn.setAttribute('aria-pressed', String(shown >= 0));
    if (shown >= 0 && last.solutions.length > 1) {
      editor.setMessage(`Showing solution ${shown + 1} of ${last.solutions.length}+. ${describe(last)}`, 'error');
    }
  });

  setChip('checking', 'Checking');
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
