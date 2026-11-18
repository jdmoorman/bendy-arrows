import type { Rating, TableState } from './library-table';
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
  tab?: 'play' | 'edit' | 'library';
}

const LIBRARY_KEY = 'hamiltonian.library.v1';
const SESSION_KEY = 'hamiltonian.session.v1';
const SETTINGS_KEY = 'hamiltonian.settings.v1';
const TIMES_KEY = 'hamiltonian.times.v1';
const LOGIC_KEY = 'hamiltonian.logic.v1';
const GENERATOR_KEY = 'hamiltonian.generator.v1';
const DAILY_KEY = 'hamiltonian.daily.v1';
const TABLE_KEY = 'hamiltonian.libtable.v1';
const RATINGS_KEY = 'hamiltonian.ratings.v1';
const HIDDEN_KEY = 'hamiltonian.hiddensamples.v1';
const SHOW_SOLUTION_KEY = 'hamiltonian.showsolution.v1';
const HINTS_INLINE_KEY = 'hamiltonian.hintsinline.v1';

/** Per-device display preferences. */
export interface Settings {
  /** Shade alternate tiles faintly. */
  checkerboard: boolean;
  /** Show the solve timer while playing. */
  showTimer: boolean;
  /** Highlight mistakes (branches, early loops, numbers out of order) as you play. */
  autoCheck: boolean;
  /** Use the dark colour theme. */
  darkTheme: boolean;
  /** Label columns with letters (A, B, …) and rows with numbers (1, 2, …) around the board. */
  coordinates: boolean;
}

export const DEFAULT_SETTINGS: Settings = { checkerboard: true, showTimer: false, autoCheck: true, darkTheme: false, coordinates: false };

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
  loadTimes(code: string): { ms: number; at: number; hints?: number; checks?: number }[] {
    const all = this.read<Record<string, { ms: number; at: number; hints?: number; checks?: number }[]>>(TIMES_KEY, {});
    const list = all && typeof all === 'object' ? all[code] : undefined;
    return Array.isArray(list) ? list.filter((t) => t && typeof t.ms === 'number' && typeof t.at === 'number') : [];
  }

  saveTimes(code: string, times: { ms: number; at: number; hints?: number; checks?: number }[]): void {
    const all = this.read<Record<string, { ms: number; at: number; hints?: number; checks?: number }[]>>(TIMES_KEY, {});
    this.write(TIMES_KEY, { ...(all && typeof all === 'object' ? all : {}), [code]: times });
  }

  /**
   * Enabled logic-helper rules and the rules that existed when they were
   * saved, or null if never saved. (Old saves are a plain list: `known` is missing.)
   */
  loadLogicRules(): { enabled: string[]; known?: string[]; auto?: boolean; areaSourcesOff?: string[] } | null {
    const r = this.read<unknown>(LOGIC_KEY, null);
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
    if (Array.isArray(r)) return { enabled: strings(r) };
    if (r && typeof r === 'object' && 'enabled' in r) {
      const o = r as { enabled: unknown; known?: unknown; auto?: unknown; areaSourcesOff?: unknown };
      return {
        enabled: strings(o.enabled),
        known: Array.isArray(o.known) ? strings(o.known) : undefined,
        auto: o.auto === true,
        areaSourcesOff: Array.isArray(o.areaSourcesOff) ? strings(o.areaSourcesOff) : undefined,
      };
    }
    return null;
  }

  saveLogicRules(choice: { enabled: string[]; known: string[]; auto?: boolean; areaSourcesOff?: string[] }): void {
    this.write(LOGIC_KEY, choice);
  }

  /** The generator's last-used options (checked by the caller). */
  loadGeneratorOptions(): Record<string, unknown> | null {
    const o = this.read<unknown>(GENERATOR_KEY, null);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  }

  saveGeneratorOptions(o: object): void {
    this.write(GENERATOR_KEY, o);
  }

  /** The library table's search, filters, sort and columns, or null if never changed. */
  loadLibraryTable(): Partial<TableState> | null {
    const t = this.read<unknown>(TABLE_KEY, null);
    return t && typeof t === 'object' ? (t as Partial<TableState>) : null;
  }

  saveLibraryTable(state: TableState): void {
    this.write(TABLE_KEY, state);
  }

  /** Whether the editor overlays the solution (or every line any solution uses). */
  loadShowSolution(): boolean {
    return this.read<unknown>(SHOW_SOLUTION_KEY, false) === true;
  }

  saveShowSolution(on: boolean): void {
    this.write(SHOW_SOLUTION_KEY, on);
  }

  /** Whether the editor's hint list sits on one line beside the difficulty (else a list under it). */
  loadHintsInline(): boolean {
    return this.read<unknown>(HINTS_INLINE_KEY, false) === true;
  }

  saveHintsInline(on: boolean): void {
    this.write(HINTS_INLINE_KEY, on);
  }

  /** Codes of built-in samples deleted from this device's library. */
  loadHiddenSamples(): string[] {
    const h = this.read<unknown>(HIDDEN_KEY, []);
    return Array.isArray(h) ? h.filter((x): x is string => typeof x === 'string') : [];
  }

  saveHiddenSamples(codes: string[]): void {
    this.write(HIDDEN_KEY, codes);
  }

  /** Difficulty and uniqueness of saved puzzles, by code, worked out in the background. */
  loadRatings(): Record<string, Rating> {
    const r = this.read<unknown>(RATINGS_KEY, {});
    return r && typeof r === 'object' ? (r as Record<string, Rating>) : {};
  }

  saveRating(code: string, rating: Rating): void {
    this.write(RATINGS_KEY, { ...this.loadRatings(), [code]: rating });
  }

  /** The daily puzzle, if one was made for `date` (YYYY-MM-DD). */
  loadDaily(date: string): string | null {
    const d = this.read<{ date?: unknown; code?: unknown } | null>(DAILY_KEY, null);
    return d && d.date === date && typeof d.code === 'string' ? d.code : null;
  }

  saveDaily(date: string, code: string): void {
    this.write(DAILY_KEY, { date, code });
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
