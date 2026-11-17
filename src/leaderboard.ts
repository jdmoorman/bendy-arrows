import type { Storage } from './storage';

export interface TimeEntry {
  /** Solve time in milliseconds. */
  ms: number;
  /** When it was recorded (epoch ms). */
  at: number;
  /** Hints used during the attempt. */
  hints?: number;
  /** Checks used during the attempt. */
  checks?: number;
}

export interface RecordResult {
  /** All times for the puzzle, fastest first. */
  entries: TimeEntry[];
  /** Position of the new time in `entries`. */
  index: number;
}

/**
 * Where solve times go. Today this is the player's own times on this device;
 * a global leaderboard can implement the same interface later.
 */
export interface Leaderboard {
  readonly title: string;
  record(puzzleCode: string, ms: number, extra?: Omit<TimeEntry, 'ms' | 'at'>): Promise<RecordResult>;
  list(puzzleCode: string): Promise<TimeEntry[]>;
}

const sortTimes = (xs: TimeEntry[]) => [...xs].sort((a, b) => a.ms - b.ms || a.at - b.at);

export class LocalLeaderboard implements Leaderboard {
  readonly title = 'Your times';

  constructor(private storage: Storage) {}

  async list(puzzleCode: string): Promise<TimeEntry[]> {
    return sortTimes(this.storage.loadTimes(puzzleCode));
  }

  async record(puzzleCode: string, ms: number, extra: Omit<TimeEntry, 'ms' | 'at'> = {}): Promise<RecordResult> {
    const entry: TimeEntry = { ms: Math.round(ms), at: Date.now(), ...extra };
    const entries = sortTimes([...this.storage.loadTimes(puzzleCode), entry]);
    this.storage.saveTimes(puzzleCode, entries.slice(0, 100));
    return { entries, index: entries.indexOf(entry) };
  }
}
