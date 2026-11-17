import { describe, expect, test } from 'vitest';
import { LocalLeaderboard } from '../src/leaderboard';
import { Storage, type KeyValueStore } from '../src/storage';
import { formatDuration, formatTime, SolveTimer } from '../src/timer';

class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('SolveTimer', () => {
  test('counts from load, only while active, until solved', () => {
    let now = 0;
    const t = new SolveTimer(() => now);
    t.reset();
    t.setActive(true);
    now = 3000;
    expect(t.elapsed).toBe(3000);
    t.setActive(false); // switched tab / backgrounded
    now = 60_000;
    expect(t.elapsed).toBe(3000);
    t.setActive(true);
    now = 61_000;
    t.stop();
    now = 99_000;
    expect(t.elapsed).toBe(4000);
  });

  test('a puzzle loaded while another tab is showing waits until Play is shown', () => {
    let now = 0;
    const t = new SolveTimer(() => now);
    t.reset();
    now = 5000;
    expect(t.elapsed).toBe(0);
    t.setActive(true);
    now = 7000;
    expect(t.elapsed).toBe(2000);
  });

  test('resumes from saved time', () => {
    let now = 0;
    const t = new SolveTimer(() => now);
    t.reset(10_000);
    t.setActive(true);
    now = 2000;
    expect(t.elapsed).toBe(12_000);
  });
});

test('formatDuration (messages)', () => {
  expect(formatDuration(0)).toBe('0 seconds');
  expect(formatDuration(1000)).toBe('1 second');
  expect(formatDuration(42_400)).toBe('42 seconds');
  expect(formatDuration(60_000)).toBe('1:00');
});

test('formatTime (clock style)', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(42_400)).toBe('0:42');
  expect(formatTime(83_400)).toBe('1:23');
  expect(formatTime(3_723_000)).toBe('1:02:03');
});

describe('LocalLeaderboard', () => {
  test('records times fastest first and reports the new rank', async () => {
    const lb = new LocalLeaderboard(new Storage(new MemStore()));
    expect((await lb.record('P', 50_000)).index).toBe(0);
    const r = await lb.record('P', 70_000);
    expect(r.index).toBe(1);
    expect(r.entries.map((e) => e.ms)).toEqual([50_000, 70_000]);
    expect((await lb.record('P', 30_000)).index).toBe(0);
    expect(await lb.list('OTHER')).toEqual([]);
  });
});
