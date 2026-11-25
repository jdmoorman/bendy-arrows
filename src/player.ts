import './levels-sync';
import './style.css';
import { decodePuzzle, encodePuzzle } from './codec';
import { ICONS } from './icons';
import { findLevel, levelName, PACKS, type LevelRef } from './levels';
import { endVariants, type Puzzle } from './model';
import { padFor, renderBoard } from './render';
import { RATING_VERSION } from './library-table';
import { DIFFICULTIES, DIFFICULTY_NAMES, difficultyOf, type HintCount } from './difficulty';
import type { RatingMessage, RatingRequest } from './rating.worker';
import { PlayView } from './play';
import { allLogsText, puzzleLogText } from './solve-log';
import { download, openShareSheet, puzzleFromHash } from './share';
import { applySettings, openSettingsSheet } from './settings-ui';
import { Storage, type PlayerState } from './storage';
import { applyTheme, DEFAULT_THEME } from './themes';
import { el, toast } from './ui';

// --- Address and Back button ----------------------------------------------------
// The address follows the view: "#p=CODE" while playing (so it can be copied to share the
// puzzle), bare on the level list. Each change of view or puzzle is a browser history entry, so
// Back returns to the previous one. While starting up, going back, or opening a typed-in
// address, the view changes without adding an entry.
type HistoryState = { tab?: Tab; code?: string };
let restoringTab = true;
function rememberTab(t: Tab) {
  const code = t === 'play' ? currentCode : '';
  const url = location.pathname + location.search + (code ? `#p=${code}` : '');
  const s = history.state as HistoryState | null;
  const entry: HistoryState = { tab: t, ...(code ? { code } : {}) };
  if (restoringTab || (s?.tab === t && (s.code ?? '') === code)) history.replaceState(entry, '', url);
  else history.pushState(entry, '', url);
}
window.addEventListener('popstate', (ev) => {
  const s = ev.state as HistoryState | null;
  if (!s?.tab) return;
  restoringTab = true;
  if (s.tab === 'play' && s.code && s.code !== currentCode) openCode(s.code);
  else goBackTo(s.tab);
  restoringTab = false;
});

/**
 * The player's app: just Play and the level packs. (The creator's app, with the editor and
 * the Library, is create.html.)
 */

applyTheme(DEFAULT_THEME);

type Tab = 'play' | 'levels';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <h1 class="app-title">BendyArrows</h1>
    <button class="btn labelled" data-act="exit" title="Exit to the levels">${ICONS.exit}<span>Exit</span></button>
    <button class="btn labelled touch-only" data-act="share" title="Share or open a puzzle">${ICONS.share}<span>Share</span></button>
    <button class="btn labelled" data-act="settings">${ICONS.settings}<span>Settings</span></button>
  </header>
  <main class="views"></main>
`;

const storage = new Storage();
let settings = storage.loadSettings();
applySettings(settings);
const titleEl = app.querySelector<HTMLElement>('.app-title')!;
const header = app.querySelector<HTMLElement>('.app-header')!;
const play = new PlayView();
const levels = el('div', 'view levels-view hidden');
app.querySelector('.views')!.append(play.el, levels);
play.setAutoCheck(settings.autoCheck);
play.setHintMoves(settings.hintMoves);
play.setKeyboard(settings.keyboard);

const state: PlayerState = storage.loadPlayer();

// One-shot levels used to be plain puzzles: their codes changed when they learned they're
// one-shots, so carry solved marks and unfinished boards over from the old codes.
for (const pack of PACKS) {
  for (const code of pack.levels) {
    const p = decodePuzzle(code);
    if (p.oneShot) {
      const old = encodePuzzle({ ...p, oneShot: undefined });
      if (storage.isSolved(old)) storage.markSolved(code);
      if (state.progress[old] && !state.progress[code]) state.progress[code] = state.progress[old];
      delete state.progress[old];
    }
    // Levels were turned or mirrored, and their arrows moved round corner tiles, to place the
    // ends better: a level solved the old way stays solved (an unfinished board doesn't carry
    // over, as its lines would move).
    if (!storage.isSolved(code)) {
      for (const q of endVariants(p).slice(1)) {
        for (const old of [encodePuzzle(q), encodePuzzle({ ...q, oneShot: undefined })]) if (storage.isSolved(old)) storage.markSolved(code);
      }
    }
  }
}
/** The level on the board, or none for a puzzle opened from a link. */
let current: LevelRef | undefined;
let currentCode = '';
let tab: Tab = 'levels';

const valid = (ref: LevelRef | undefined): ref is LevelRef => !!ref && !!PACKS[ref.pack]?.levels[ref.level];

function save() {
  // The pack, not the level: packs and levels can be reordered between visits.
  if (current) state.pack = PACKS[current.pack].name;
  delete state.current;
  state.tab = tab;
  storage.savePlayer(state);
}

function setTab(t: Tab) {
  rememberTab(t);
  tab = t;
  play.el.classList.toggle('hidden', t !== 'play');
  levels.classList.toggle('hidden', t !== 'levels');
  if (t === 'levels') drawLevels();
  // No tabs: a level is opened from the list, and Exit (shown while playing) goes back to it.
  for (const a of ['exit', 'share']) app.querySelector(`[data-act=${a}]`)!.classList.toggle('hidden', t !== 'play');
  fitHeader();
  save();
}

function title(short = false): string {
  if (!current) return 'Puzzle';
  return short ? `${PACKS[current.pack].name.charAt(0)}. ${current.level + 1}` : levelName(current);
}

/** The header: the level's name and difficulty while playing, else the app's name. */
function showTitle(short = false, stacked = false) {
  titleEl.classList.toggle('stacked', stacked);
  titleEl.textContent = tab === 'play' ? title(short) : 'BendyArrows';
  titleEl.title = tab === 'play' && short ? title() : '';
  // Shortened, the name is shown as "S. 7" but read out in full.
  if (tab === 'play' && short) {
    titleEl.replaceChildren(el('span', '', title(true)), el('span', 'sr-only', title()));
    titleEl.firstElementChild!.setAttribute('aria-hidden', 'true');
  }
  if (tab === 'play' && currentCode) {
    const d = difficultyBadge(currentCode);
    if (d) titleEl.append(d);
  }
}

/**
 * The level's full name, unless the header's buttons would cut it short: then just the pack's
 * first letter and the level's number ("S. 7"), then that with the difficulty dots under it. If
 * none of those fit, the buttons' names go under their icons, and the same again from the full name.
 * Checked whenever the title or the width changes.
 */
function fitHeader() {
  const cut = () => titleEl.scrollWidth > titleEl.clientWidth;
  for (const compact of [false, true]) {
    header.classList.toggle('compact', compact);
    showTitle();
    if (cut()) showTitle(true);
    if (cut()) showTitle(true, true);
    if (!cut()) return;
  }
}
new ResizeObserver(fitHeader).observe(header);

// --- Difficulty -------------------------------------------------------------
// A level's difficulty is how many hints a player alternating the easy rules and hints needs
// (for a one-shot, along its stroke), worked out once in the background and kept (the ratings
// the creator's Library uses too). Shown as four dots, as many coloured in as the difficulty
// (green, yellow, orange, red), the rest grey.

const ratings = storage.loadRatings();
/** Hints a level needs, whether hints alone get stuck, and the biggest area a hint reasons about (if worked out with today's rules). */
function hintsFor(code: string): HintCount | null {
  const r = ratings[code];
  return r && r.v === RATING_VERSION && typeof r.hints === 'number' ? { hints: r.hints, stuck: !!r.hintsStuck, maxArea: r.maxArea ?? 0 } : null;
}
/** Difficulty from 1 to 4 (see difficulty.ts, which the generator uses too). */
const difficulty = (h: HintCount) => DIFFICULTIES.indexOf(difficultyOf(h)) + 1;
/** Four dots, the first `difficulty` coloured in; null until it's worked out. */
function difficultyBadge(code: string): HTMLElement | null {
  const h = hintsFor(code);
  if (!h) return null;
  const d = difficulty(h);
  const badge = el('span', `difficulty d${d}`, Array.from({ length: 4 }, (_, i) => `<i${i < d ? ' class="on"' : ''}></i>`).join(''));
  const label = DIFFICULTY_NAMES[DIFFICULTIES[d - 1]];
  badge.title = label;
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', `Difficulty: ${label}`);
  return badge;
}
/** Work out the difficulty of every level not yet rated, a few at a time, showing each as it comes. */
function rateLevels() {
  const todo = PACKS.flatMap((k) => k.levels).filter((c) => !hintsFor(c));
  if (!todo.length) return;
  const worker = new Worker(new URL('./rating.worker.ts', import.meta.url), { type: 'module' });
  let left = todo.length;
  worker.onmessage = (ev: MessageEvent<RatingMessage>) => {
    const { code, rating } = ev.data;
    ratings[code] = rating;
    storage.saveRating(code, rating);
    for (const card of levels.querySelectorAll<HTMLElement>(`.level-btn[data-code="${code}"]`)) {
      card.querySelector('.difficulty')?.remove();
      const d = difficultyBadge(code);
      if (d) card.append(d);
    }
    if (code === currentCode) fitHeader();
    if (--left === 0) worker.terminate();
  };
  worker.postMessage(todo satisfies RatingRequest);
}

/** Put a puzzle on the board: a level, or (with no ref) one from a link. */
function load(p: Puzzle, code: string, ref: LevelRef | undefined) {
  current = ref;
  currentCode = code;
  // A level solved before starts with a clean board; an unfinished one picks up where it was.
  play.load(p, state.progress[code]);
  setTab('play');
}

function openLevel(ref: LevelRef) {
  const code = PACKS[ref.pack].levels[ref.level];
  load(decodePuzzle(code), code, ref);
}

play.onProgress = (progress, solved) => {
  // A solved level starts afresh next time; an unfinished one keeps its lines.
  if (solved) delete state.progress[currentCode];
  else if (progress.segments.length || progress.xMarks.length) state.progress[currentCode] = progress;
  else delete state.progress[currentCode];
  save();
};

play.onSolved = () => {
  storage.markSolved(currentCode);
  if (play.gold) storage.markGold(currentCode);
};

/** The level after this one: the next in the pack, else the first of the next pack. */
function nextLevel(ref: LevelRef): LevelRef | undefined {
  if (ref.level + 1 < PACKS[ref.pack].levels.length) return { pack: ref.pack, level: ref.level + 1 };
  return ref.pack + 1 < PACKS.length ? { pack: ref.pack + 1, level: 0 } : undefined;
}

// Solved: the Hint button becomes Next level (after the very last level, All levels).
play.solvedAction = () => {
  const next = current && nextLevel(current);
  return next ? { label: 'Next level', run: () => openLevel(next) } : { label: 'All levels', run: () => setTab('levels') };
};

/** The two kinds of level, each introduced above its packs. */
const KINDS = {
  classic: {
    title: 'Classic',
    intro: [
      "Find a path from the arrow's tail to its head, visiting every tile exactly once. Work on any part of the board, in any order.",
    ],
  },
  oneShot: {
    title: 'One-shot',
    intro: [
      'The same rules, but you must draw the whole path in order starting from the tail.',
    ],
  },
};

/**
 * The packs, grouped by kind (classic, then one-shot) under a heading that explains it; each
 * pack with its levels as numbered buttons: solved ones ticked, the current one marked.
 */
function drawLevels() {
  // A pack the player has completely solved folds away, once: unfolding it again keeps it open.
  // One that gains new levels unfolds, and folds again when they're solved too.
  for (const pack of PACKS) {
    const done = pack.levels.every((c) => storage.isSolved(c));
    const auto = state.autoCollapsed.includes(pack.name);
    if (done && !auto) {
      state.autoCollapsed.push(pack.name);
      if (!state.collapsed.includes(pack.name)) state.collapsed.push(pack.name);
    } else if (!done && auto) {
      state.autoCollapsed = state.autoCollapsed.filter((n) => n !== pack.name);
      state.collapsed = state.collapsed.filter((n) => n !== pack.name);
    }
  }
  const packs = PACKS.map((pack, pi) => {
    // Each pack folds away (tap its heading); the choice is remembered per pack.
    const section = el('details', 'pack');
    section.open = !state.collapsed.includes(pack.name);
    section.addEventListener('toggle', () => {
      state.collapsed = state.collapsed.filter((n) => n !== pack.name);
      if (!section.open) state.collapsed.push(pack.name);
      save();
    });
    const solved = pack.levels.filter((c) => storage.isSolved(c)).length;
    const head = el('summary', 'pack-head');
    const name = el('h3', 'pack-name');
    head.append(el('span', 'pack-chevron', ICONS.chevron));
    name.textContent = pack.name;
    const count = el('span', 'pack-count', `${solved} of ${pack.levels.length} solved`);
    head.append(name, count);
    const grid = el('div', 'level-grid');
    pack.levels.forEach((code, li) => {
      // A card with the level's board (and the lines of an unfinished one), and a tick when
      // solved (its number is only in its label, for screen readers). A real link, so the browser offers Open in new tab (right-click, long press, Cmd-click).
      const b = el('a', 'level-btn') as HTMLAnchorElement;
      b.href = `#p=${code}`;
      const done = storage.isSolved(code);
      const started = !done && !!state.progress[code];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('board', 'level-board');
      svg.setAttribute('aria-hidden', 'true');
      const p = decodePuzzle(code);
      const marks = state.progress[code];
      renderBoard(svg, p, { coordinates: false, pad: padFor(p, false, false), segments: started ? new Set(marks.segments) : undefined, xMarks: started ? new Set(marks.xMarks) : undefined });
      b.dataset.code = code;
      b.append(svg);
      // Solved: a tick; with a gold star (no hints, and for a one-shot no backtracks), a star.
      const gold = done && storage.isGold(code);
      b.classList.toggle('gold', gold);
      if (done) b.append(el('span', `level-check${gold ? ' gold' : ''}`, gold ? ICONS.star : ICONS.check));
      const d = difficultyBadge(code);
      if (d) b.append(d);
      b.classList.toggle('solved', done);
      b.classList.toggle('started', started);
      b.classList.toggle('current', current?.pack === pi && current.level === li);
      b.setAttribute('aria-label', `Level ${li + 1}${done ? (storage.isGold(code) ? ', solved with a gold star' : ', solved') : started ? ', started' : ''}`);
      b.addEventListener('click', (ev) => {
        // With Cmd, Ctrl, Shift or Alt the browser handles it (a new tab or window).
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        openLevel({ pack: pi, level: li });
      });
      grid.append(b);
    });
    section.append(head, grid);
    return section;
  });
  // A heading and explanation before each run of packs of one kind.
  const out: HTMLElement[] = [];
  PACKS.forEach((pack, pi) => {
    if (pi === 0 || !!PACKS[pi - 1].oneShot !== !!pack.oneShot) {
      const kind = pack.oneShot ? KINDS.oneShot : KINDS.classic;
      const intro = el('section', 'level-kind');
      const title = el('h2', 'level-kind-title');
      title.textContent = kind.title;
      intro.append(title, ...kind.intro.map((t) => Object.assign(el('p', 'level-kind-text'), { textContent: t })));
      out.push(intro);
    }
    out.push(packs[pi]);
  });
  levels.replaceChildren(...out);
}

app.querySelector('[data-act=exit]')!.addEventListener('click', () => setTab('levels'));

// Share the puzzle on the board (or open one).
app.querySelector('[data-act=share]')!.addEventListener('click', () => {
  if (!currentCode) return toast('Open a level first.');
  openShareSheet({
    puzzle: decodePuzzle(currentCode),
    name: title(),
    onOpen: (p) => load(p, encodePuzzle(p), findLevel(encodePuzzle(p)) ?? undefined),
  });
});

/** Download every kept solve log as a text file, each named after its level where it is one. */
function exportSolveLogs() {
  const text = allLogsText((c) => {
    const ref = findLevel(c);
    return ref ? levelName(ref) : undefined;
  });
  if (!text) return toast('No solve logs yet.');
  download(`solve-logs-${new Date().toISOString().slice(0, 10)}.txt`, text, 'text/plain');
}

/** Whether any solve log is kept. */
const hasLogs = () => !!allLogsText(() => undefined);

/** The puzzle being played's solve log as a download, if it has one (for Settings). */
function exportPuzzleLog(): (() => void) | undefined {
  const name = current ? levelName(current) : undefined;
  const text = currentCode ? puzzleLogText(currentCode, name) : '';
  if (!text) return undefined;
  return () => download(`solve-log-${(name || currentCode).replace(/[^\w-]+/g, '-')}.txt`, text, 'text/plain');
}

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    play.render();
    play.setAutoCheck(s.autoCheck);
    play.setHintMoves(s.hintMoves);
    play.setKeyboard(s.keyboard);
    storage.saveSettings(s);
  }, hasLogs() ? exportSolveLogs : undefined, exportPuzzleLog());
});

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  if (document.querySelector('dialog[open]') || tab !== 'play') return;
  if (play.handleKey(ev)) ev.preventDefault();
});

/** A puzzle from a shared link ("#p=CODE"): played as its level if it is one. */
function openLink(): boolean {
  let p: Puzzle | null = null;
  try {
    p = puzzleFromHash(location.hash);
  } catch {
    toast("This link doesn't contain a valid puzzle.", 'error');
  }
  if (!p) {
    history.replaceState(history.state, '', location.pathname + location.search);
    return false;
  }
  openCode(encodePuzzle(p));
  return true;
}

/** Play a puzzle by its code: as its level if it is one. */
function openCode(code: string) {
  const ref = findLevel(code);
  if (ref) openLevel(ref);
  else load(decodePuzzle(code), code, undefined);
}

// A puzzle address typed or pasted into the address bar (Back and Forward are handled above, and
// the address already shows the puzzle on the board).
window.addEventListener('hashchange', () => {
  if (!location.hash || (tab === 'play' && location.hash === `#p=${currentCode}`)) return;
  restoringTab = true;
  openLink();
  restoringTab = false;
});

// Save the board when the page is hidden (phones often discard background tabs).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/** Back to a tab: Play only with a level on the board (else the Levels tab). */
function goBackTo(t: Tab) {
  setTab(t === 'play' && !currentCode ? 'levels' : t);
}

/**
 * Opening the app: a link's puzzle, or else the Levels tab at the pack last played (open, and
 * scrolled to), rather than a level, since packs and levels may have been reordered.
 */
function start() {
  rateLevels();
  if (location.hash && openLink()) return;
  // Older saves kept the level's place: find its pack.
  if (!state.pack && valid(state.current)) state.pack = PACKS[state.current.pack].name;
  delete state.current;
  const pi = PACKS.findIndex((k) => k.name === state.pack);
  // Unfolded, unless it's completely solved (those stay folded).
  if (pi >= 0 && !PACKS[pi].levels.every((c) => storage.isSolved(c))) state.collapsed = state.collapsed.filter((n) => n !== state.pack);
  setTab('levels');
  if (pi >= 0) levels.querySelectorAll<HTMLElement>('.pack')[pi]?.scrollIntoView({ block: 'start' });
}

// The first history entry is the view the app opened on (start sets it).
start();
restoringTab = false;
