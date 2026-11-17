import type { RecordResult } from './leaderboard';
import { formatDuration, formatTime } from './timer';
import { el, openSheet } from './ui';

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Shown when a puzzle is solved: the time, its rank, and the leaderboard. */
export function openSolvedSheet(opts: {
  ms: number;
  result: RecordResult;
  boardTitle: string;
  onPlayAgain: () => void;
}): void {
  const { entries, index } = opts.result;
  const body = el('div', 'sheet-stack solved');

  const time = el('p', 'solved-time');
  time.textContent = formatDuration(opts.ms);
  const sub = el('p', 'solved-sub');
  if (entries.length === 1) sub.textContent = 'Your first solve of this puzzle.';
  else if (index === 0) sub.textContent = `New personal best! Previous best ${formatDuration(entries[1].ms)}.`;
  else sub.textContent = `#${index + 1} of ${entries.length} — best ${formatDuration(entries[0].ms)}.`;
  body.append(time, sub);

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
    const d = el('span', 'time-date');
    d.textContent = dateFmt.format(e.at);
    li.append(rank, t, d);
    list.append(li);
  }
  body.append(list);

  const row = el('div', 'sheet-row');
  const again = el('button', 'btn', '<span>Play again</span>');
  const done = el('button', 'btn primary', '<span>Done</span>');
  row.append(again, done);
  body.append(row);

  const sheet = openSheet('Solved!', body);
  again.addEventListener('click', () => {
    sheet.close();
    opts.onPlayAgain();
  });
  done.addEventListener('click', () => sheet.close());
}
