import type { RecordResult } from './leaderboard';
import { formatDuration, formatTime } from './timer';
import { el, openSheet } from './ui';

/** "2 hints · 1 check" (nothing when no help was used). */
function helpText(e: { hints?: number; checks?: number }): string {
  const parts: string[] = [];
  const h = e.hints ?? 0;
  const c = e.checks ?? 0;
  if (h) parts.push(`${h} hint${h === 1 ? '' : 's'}`);
  if (c) parts.push(`${c} check${c === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Shown when a puzzle is solved: the time and the leaderboard. */
export function openSolvedSheet(opts: {
  ms: number;
  result: RecordResult;
  boardTitle: string;
  onPlayAgain: () => void;
  /** Pick a different puzzle (for now, the library). */
  onAnotherPuzzle: () => void;
}): void {
  const { entries, index } = opts.result;
  const body = el('div', 'sheet-stack solved');

  const time = el('p', 'solved-time');
  time.textContent = formatDuration(opts.ms);
  body.append(time);

  body.append(el('p', 'field-label', opts.boardTitle));
  const list = el('ol', 'times');
  const shown = entries.slice(0, 10);
  // Make sure the new time is visible even if it is outside the top 10.
  const rows: [number, (typeof entries)[number]][] = shown.map((e, i) => [i, e]);
  if (index >= shown.length) rows.push([index, entries[index]]);
  for (const [i, e] of rows) {
    const li = el('li', i === index ? 'time-row current' : 'time-row');
    const rank = el('span', 'time-rank');
    rank.textContent = `${i + 1}`;
    const t = el('span', 'time-value');
    t.textContent = formatTime(e.ms);
    const help = helpText(e);
    if (help) t.append(Object.assign(el('small', 'time-help'), { textContent: help }));
    const d = el('span', 'time-date');
    d.textContent = dateFmt.format(e.at);
    li.append(rank, t, d);
    list.append(li);
  }
  body.append(list);

  const row = el('div', 'sheet-row');
  const again = el('button', 'btn', '<span>Play again</span>');
  const another = el('button', 'btn primary', '<span>Another puzzle</span>');
  row.append(again, another);
  body.append(row);

  const sheet = openSheet('Solved!', body);
  again.addEventListener('click', () => {
    sheet.close();
    opts.onPlayAgain();
  });
  another.addEventListener('click', () => {
    sheet.close();
    opts.onAnotherPuzzle();
  });
}
