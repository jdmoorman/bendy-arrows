import type { Progress } from './play';

/**
 * Browser-local persistence. Every access is wrapped in try/catch: storage can
 * be unavailable (private mode, blocked site data) and the app must still work.
 */

export interface LibraryEntry {
  id: string;
  name: string;
  /** Share code of the puzzle. */
  code: string;
  created: number;
  updated: number;
  progress?: Progress;
  solved?: boolean;
}

export interface Session {
  code: string;
  progress: Progress;
  libraryId?: string;
  name?: string;
  /** Unsaved work in the editor, if it differs from the played puzzle. */
  editorCode?: string;
  tab?: 'play' | 'edit';
}

const LIBRARY_KEY = 'hamiltonian.library.v1';
const SESSION_KEY = 'hamiltonian.session.v1';
const SETTINGS_KEY = 'hamiltonian.settings.v1';
const TIMES_KEY = 'hamiltonian.times.v1';
const LOGIC_KEY = 'hamiltonian.logic.v1';

/** Per-device display preferences. */
export interface Settings {
  /** Shade alternate tiles faintly. */
  checkerboard: boolean;
  /** Show the solve timer while playing. */
  showTimer: boolean;
}

export const DEFAULT_SETTINGS: Settings = { checkerboard: true, showTimer: false };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class Storage {
  constructor(private store: KeyValueStore | null = defaultStore()) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.store?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): boolean {
    try {
      if (!this.store) return false;
      this.store.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  get available(): boolean {
    return this.store !== null;
  }

  list(): LibraryEntry[] {
    const items = this.read<LibraryEntry[]>(LIBRARY_KEY, []);
    if (!Array.isArray(items)) return [];
    return items
      .filter((e) => e && typeof e.id === 'string' && typeof e.code === 'string')
      .sort((a, b) => b.updated - a.updated);
  }

  get(id: string): LibraryEntry | undefined {
    return this.list().find((e) => e.id === id);
  }

  findByCode(code: string): LibraryEntry | undefined {
    return this.list().find((e) => e.code === code);
  }

  /** Insert or replace an entry. Returns false if it could not be stored. */
  put(entry: LibraryEntry): boolean {
    const items = this.list().filter((e) => e.id !== entry.id);
    items.push(entry);
    return this.write(LIBRARY_KEY, items);
  }

  remove(id: string): boolean {
    return this.write(
      LIBRARY_KEY,
      this.list().filter((e) => e.id !== id),
    );
  }

  /** Record play progress for an entry, if it still holds this puzzle. */
  updateProgress(id: string, code: string, progress: Progress, solved: boolean): void {
    const e = this.get(id);
    if (!e || e.code !== code) return;
    this.put({ ...e, progress, solved: solved || !!e.solved, updated: Date.now() });
  }

  /** Solve times for a puzzle (by share code), as stored. */
  loadTimes(code: string): { ms: number; at: number }[] {
    const all = this.read<Record<string, { ms: number; at: number }[]>>(TIMES_KEY, {});
    const list = all && typeof all === 'object' ? all[code] : undefined;
    return Array.isArray(list) ? list.filter((t) => t && typeof t.ms === 'number' && typeof t.at === 'number') : [];
  }

  saveTimes(code: string, times: { ms: number; at: number }[]): void {
    const all = this.read<Record<string, { ms: number; at: number }[]>>(TIMES_KEY, {});
    this.write(TIMES_KEY, { ...(all && typeof all === 'object' ? all : {}), [code]: times });
  }

  /** Enabled logic-helper rules, or null if never saved. */
  loadLogicRules(): string[] | null {
    const r = this.read<unknown>(LOGIC_KEY, null);
    return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : null;
  }

  saveLogicRules(rules: string[]): void {
    this.write(LOGIC_KEY, rules);
  }

  loadSettings(): Settings {
    const s = this.read<Partial<Settings> | null>(SETTINGS_KEY, null);
    return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  }

  saveSettings(s: Settings): void {
    this.write(SETTINGS_KEY, s);
  }

  loadSession(): Session | null {
    const s = this.read<Session | null>(SESSION_KEY, null);
    return s && typeof s.code === 'string' && s.progress ? s : null;
  }

  saveSession(s: Session): void {
    this.write(SESSION_KEY, s);
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
