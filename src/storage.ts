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
  /** The imported set it came in with (named after the file); none for puzzles saved here. */
  collection?: string;
}

export interface Session {
  code: string;
  progress: Progress;
  libraryId?: string;
  name?: string;
  /** Unsaved work in the editor, if it differs from the played puzzle. */
  editorCode?: string;
  /** The unsaved editor puzzle was made with New puzzle or Generate (not edited from the played one). */
  editorReplaced?: boolean;
  tab?: 'play' | 'edit' | 'library' | 'packs';
}

const LIBRARY_KEY = 'bendyarrows.library.v1';
const SESSION_KEY = 'bendyarrows.session.v1';
const SETTINGS_KEY = 'bendyarrows.settings.v1';
const SOLVED_KEY = 'bendyarrows.solved.v1';
/** Old solve times (the timer is gone): read once to seed SOLVED_KEY. */
const TIMES_KEY = 'hamiltonian.times.v1';
/** Before the rename to BendyArrows, every key started with this instead of `bendyarrows.`. */
const OLD_PREFIX = 'hamiltonian.';
const LOGIC_KEY = 'bendyarrows.logic.v1';
const GENERATOR_KEY = 'bendyarrows.generator.v1';
const TABLE_KEY = 'bendyarrows.libtable.v1';
const RATINGS_KEY = 'bendyarrows.ratings.v1';
const SHOW_SOLUTION_KEY = 'bendyarrows.showsolution.v1';
const PLAYER_KEY = 'bendyarrows.player.v1';
const PACK_MARKS_KEY = 'bendyarrows.packmarks.v1';
const PACK_FOLDED_KEY = 'bendyarrows.packfolded.v1';

/** Per-device display preferences. */
export interface Settings {
  /** Shade alternate tiles faintly. */
  checkerboard: boolean;
  /** Highlight mistakes (branches, early loops) as you play. */
  autoCheck: boolean;
  /** Use the dark colour theme. */
  darkTheme: boolean;
  /** Label columns with letters (A, B, …) and rows with numbers (1, 2, …) around the board. */
  coordinates: boolean;
}

export const DEFAULT_SETTINGS: Settings = { checkerboard: true, autoCheck: false, darkTheme: false, coordinates: false };

/** The player app's place: the level being played, the tab shown, and unfinished boards. */
export interface PlayerState {
  /** The level being played, as pack and level (from 0). */
  current?: { pack: number; level: number };
  tab: 'play' | 'levels';
  /** Lines and X's on each level started and not finished, by code. */
  progress: Record<string, Progress>;
  /** Packs folded away in the Levels tab, by name. */
  collapsed: string[];
}

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
  constructor(private store: KeyValueStore | null = defaultStore()) {
    this.migrateOldKeys();
  }

  /** Copy data saved under the old app name to the new keys (the old keys are left alone). */
  private migrateOldKeys(): void {
    const keys = [LIBRARY_KEY, SESSION_KEY, SETTINGS_KEY, SOLVED_KEY, LOGIC_KEY, GENERATOR_KEY, TABLE_KEY, RATINGS_KEY, SHOW_SOLUTION_KEY];
    try {
      for (const key of keys) {
        if (this.store?.getItem(key) !== null) continue;
        const old = this.store.getItem(OLD_PREFIX + key.slice(key.indexOf('.') + 1));
        if (old !== null) this.store.setItem(key, old);
      }
    } catch {
      /* storage unavailable or full: start fresh */
    }
  }

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

  /** Delete several entries in one write. Returns false if it could not be stored. */
  removeMany(ids: Iterable<string>): boolean {
    const gone = new Set(ids);
    return this.write(
      LIBRARY_KEY,
      this.list().filter((e) => !gone.has(e.id)),
    );
  }

  /** Record play progress for an entry, if it still holds this puzzle. */
  updateProgress(id: string, code: string, progress: Progress, solved: boolean): void {
    const e = this.get(id);
    if (!e || e.code !== code) return;
    this.put({ ...e, progress, solved: solved || !!e.solved, updated: Date.now() });
  }

  /** Share codes of every puzzle solved on this device (saved in the library or not). */
  private loadSolved(): string[] {
    const list = this.read<unknown>(SOLVED_KEY, null);
    if (Array.isArray(list)) return list.filter((c): c is string => typeof c === 'string');
    // Before this list, solves were kept as times: every puzzle with a time was solved.
    const times = this.read<unknown>(TIMES_KEY, null);
    return times && typeof times === 'object' ? Object.keys(times) : [];
  }

  /** Whether the puzzle with this share code has been solved on this device (see also an entry's `solved`). */
  isSolved(code: string): boolean {
    return this.loadSolved().includes(code);
  }

  markSolved(code: string): void {
    const list = this.loadSolved();
    if (!list.includes(code)) this.write(SOLVED_KEY, [...list, code]);
  }

  /**
   * Enabled logic-helper rules and the rules that existed when they were
   * saved, or null if never saved. (Old saves are a plain list: `known` is missing.)
   */
  loadLogicRules(): { enabled: string[]; known?: string[]; auto?: boolean; autoGroups?: string[]; areaSourcesOff?: string[] } | null {
    const r = this.read<unknown>(LOGIC_KEY, null);
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
    if (Array.isArray(r)) return { enabled: strings(r) };
    if (r && typeof r === 'object' && 'enabled' in r) {
      const o = r as { enabled: unknown; known?: unknown; auto?: unknown; autoGroups?: unknown; areaSourcesOff?: unknown };
      return {
        enabled: strings(o.enabled),
        known: Array.isArray(o.known) ? strings(o.known) : undefined,
        auto: o.auto === true,
        autoGroups: Array.isArray(o.autoGroups) ? strings(o.autoGroups) : undefined,
        areaSourcesOff: Array.isArray(o.areaSourcesOff) ? strings(o.areaSourcesOff) : undefined,
      };
    }
    return null;
  }

  saveLogicRules(choice: { enabled: string[]; known: string[]; auto?: boolean; autoGroups?: string[]; areaSourcesOff?: string[] }): void {
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

  /** The Packs tab's highlighted levels, by code. */
  loadPackMarks(): Set<string> {
    const m = this.read<unknown>(PACK_MARKS_KEY, []);
    return new Set(Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string') : []);
  }

  savePackMarks(marks: Set<string>): void {
    this.write(PACK_MARKS_KEY, [...marks]);
  }

  /** The Packs tab's folded packs, by name. */
  loadPacksFolded(): Set<string> {
    const m = this.read<unknown>(PACK_FOLDED_KEY, []);
    return new Set(Array.isArray(m) ? m.filter((x): x is string => typeof x === 'string') : []);
  }

  savePacksFolded(names: Set<string>): void {
    this.write(PACK_FOLDED_KEY, [...names]);
  }

  /** Uniqueness and hint steps of saved puzzles, by code, worked out in the background. */
  loadRatings(): Record<string, Rating> {
    const r = this.read<unknown>(RATINGS_KEY, {});
    return r && typeof r === 'object' ? (r as Record<string, Rating>) : {};
  }

  saveRating(code: string, rating: Rating): void {
    this.write(RATINGS_KEY, { ...this.loadRatings(), [code]: rating });
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

  loadPlayer(): PlayerState {
    const s = this.read<Partial<PlayerState> | null>(PLAYER_KEY, null);
    const progress = s && s.progress && typeof s.progress === 'object' ? s.progress : {};
    const c = s?.current;
    const current = c && Number.isInteger(c.pack) && Number.isInteger(c.level) ? { pack: c.pack, level: c.level } : undefined;
    const collapsed = Array.isArray(s?.collapsed) ? s.collapsed.filter((x): x is string => typeof x === 'string') : [];
    return { current, tab: s?.tab === 'play' ? 'play' : 'levels', progress, collapsed };
  }

  savePlayer(s: PlayerState): void {
    this.write(PLAYER_KEY, s);
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
