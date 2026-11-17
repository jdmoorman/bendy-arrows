import { DEFAULT_SIZE, type GenOptions, type GenType } from './generator';

/** Today's date (local time) as YYYY-MM-DD. */
export function dateKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TYPES: GenType[] = ['loop', 'path', 'checkpoints'];

/** Everyone gets the same puzzle on the same date: the seed is the date. */
export function dailyOptions(date: string): GenOptions {
  const seed = Number(date.replaceAll('-', ''));
  const day = Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000);
  return {
    seed,
    type: TYPES[day % TYPES.length],
    difficulty: 'medium',
    clues: 'mixed',
    minimal: true,
    w: DEFAULT_SIZE.medium,
    h: DEFAULT_SIZE.medium,
  };
}

export function dailyName(date: string): string {
  return `Daily puzzle ${date}`;
}
