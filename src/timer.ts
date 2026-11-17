/**
 * Solve timer. It starts as soon as a puzzle is loaded (or cleared) and
 * counts only while the play view is active (Play tab showing, page in the
 * foreground) and the puzzle is not yet solved.
 */
export class SolveTimer {
  private base = 0;
  private since: number | null = null;
  private active = false;
  private stopped = false;

  constructor(private now: () => number = () => performance.now()) {}

  /** Start a fresh count (or resume a saved one) right away. */
  reset(elapsedMs = 0, stopped = false): void {
    this.base = elapsedMs;
    this.since = null;
    this.stopped = stopped;
    this.sync();
  }

  /** The puzzle was solved: freeze the time. */
  stop(): void {
    this.stopped = true;
    this.sync();
  }

  /** Whether the play view is currently in front of the player. */
  setActive(active: boolean): void {
    this.active = active;
    this.sync();
  }

  get elapsed(): number {
    return this.base + (this.since === null ? 0 : this.now() - this.since);
  }

  private sync(): void {
    const running = this.active && !this.stopped;
    if (running && this.since === null) this.since = this.now();
    if (!running && this.since !== null) {
      this.base += this.now() - this.since;
      this.since = null;
    }
  }
}

/** Clock style: 42_000 → "0:42"; 83_400 → "1:23"; 3_723_000 → "1:02:03". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** For messages: under a minute reads "42 seconds"; longer times use clock style. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return total === 1 ? '1 second' : `${total} seconds`;
  return formatTime(ms);
}
