import type { EditorView } from './editor';
import { ICONS } from './icons';
import { solveInBackground, type SolverRun } from './solver-client';
import type { SolveResult } from './solver';

/** Adds "Check" (uniqueness) and "Show" (overlay solutions) buttons to the editor. */
export function attachUniquenessCheck(editor: EditorView): void {
  const checkBtn = document.createElement('button');
  checkBtn.className = 'btn';
  const showBtn = document.createElement('button');
  showBtn.className = 'btn icon-only hidden';
  showBtn.setAttribute('aria-label', 'Show solution');
  showBtn.innerHTML = ICONS.eye;
  editor.actions.append(showBtn, checkBtn);

  let run: SolverRun | null = null;
  let last: SolveResult | null = null;
  let shown = -1;

  const setIdle = () => {
    checkBtn.innerHTML = '<span>Check</span>';
    checkBtn.setAttribute('aria-label', 'Check for a unique solution');
  };
  const setRunning = () => {
    checkBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Stop</span>`;
    checkBtn.setAttribute('aria-label', 'Stop checking');
  };
  setIdle();

  const reset = () => {
    run?.cancel();
    run = null;
    last = null;
    shown = -1;
    showBtn.classList.add('hidden');
    setIdle();
  };

  editor.changeListeners.push(reset);

  checkBtn.addEventListener('click', async () => {
    if (run) {
      reset();
      editor.setMessage('Check stopped.');
      return;
    }
    const thisRun = solveInBackground(editor.current, (nodes) => {
      editor.setMessage(`Checking… ${nodes.toLocaleString()} steps`);
    });
    run = thisRun;
    setRunning();
    editor.setMessage('Checking…');
    try {
      const r = await thisRun.result;
      if (run !== thisRun) return;
      run = null;
      last = r;
      setIdle();
      showBtn.classList.toggle('hidden', r.solutions.length === 0);
      editor.setMessage(describe(r), r.status === 'unique' ? 'success' : 'error');
    } catch (err) {
      if (run !== thisRun) return;
      run = null;
      setIdle();
      if ((err as Error).name !== 'AbortError') editor.setMessage(`Check failed: ${(err as Error).message}`, 'error');
    }
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
