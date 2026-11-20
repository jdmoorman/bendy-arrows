import { el, openSheet } from './ui';

/** Shown when a puzzle is solved. */
export function openSolvedSheet(opts: {
  onPlayAgain: () => void;
  /** Pick a different puzzle (for now, the library). */
  onAnotherPuzzle: () => void;
  /** The label of that button (default "Another puzzle"). */
  anotherLabel?: string;
}): void {
  const body = el('div', 'sheet-stack solved');

  const title = el('p', 'solved-title');
  title.textContent = 'Solved!';
  body.append(title);

  const row = el('div', 'sheet-row');
  const again = el('button', 'btn', '<span>Play again</span>');
  const another = el('button', 'btn primary', `<span>${opts.anotherLabel ?? 'Another puzzle'}</span>`);
  row.append(again, another);
  body.append(row);

  const sheet = openSheet('', body);
  sheet.dialog.setAttribute('aria-label', 'Solved');
  again.addEventListener('click', () => {
    sheet.close();
    opts.onPlayAgain();
  });
  another.addEventListener('click', () => {
    sheet.close();
    opts.onAnotherPuzzle();
  });
}
