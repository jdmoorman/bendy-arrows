import './style.css';
import { decodePuzzle, encodePuzzle } from './codec';
import { ICONS } from './icons';
import { findLevel, levelName, PACKS, type LevelRef } from './levels';
import { endVariants, type Puzzle } from './model';
import { PlayView } from './play';
import { allLogsText } from './solve-log';
import { download, openShareSheet, puzzleFromHash } from './share';
import { applySettings, openSettingsSheet } from './settings-ui';
import { Storage, type PlayerState } from './storage';
import { applyTheme, DEFAULT_THEME } from './themes';
import { el, toast } from './ui';

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
    <div class="segmented tabs" role="tablist" aria-label="View">
      <button class="seg-btn" role="tab" data-tab="play">Play</button>
      <button class="seg-btn" role="tab" data-tab="levels">Levels</button>
    </div>
    <button class="btn icon" data-act="share" aria-label="Share or open a puzzle">${ICONS.share}</button>
    <button class="btn icon" data-act="settings" aria-label="Settings">${ICONS.settings}</button>
  </header>
  <main class="views"></main>
`;

const storage = new Storage();
let settings = storage.loadSettings();
applySettings(settings);
const titleEl = app.querySelector<HTMLElement>('.app-title')!;
const play = new PlayView();
const levels = el('div', 'view levels-view hidden');
app.querySelector('.views')!.append(play.el, levels);
play.setAutoCheck(settings.autoCheck);

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
  tab = t;
  play.el.classList.toggle('hidden', t !== 'play');
  levels.classList.toggle('hidden', t !== 'levels');
  if (t === 'levels') drawLevels();
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  titleEl.textContent = t === 'play' ? title() : 'BendyArrows';
  save();
}

function title(): string {
  return current ? levelName(current) : 'Puzzle';
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

play.onSolved = () => storage.markSolved(currentCode);

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
      'The same puzzle, with a twist: draw the whole path in one stroke.',
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
      // A real link, so the browser offers Open in new tab (right-click, long press, Cmd-click).
      const b = el('a', 'level-btn') as HTMLAnchorElement;
      b.href = `#p=${code}`;
      const done = storage.isSolved(code);
      const started = !done && !!state.progress[code];
      b.innerHTML = `<span>${li + 1}</span>${done ? ICONS.check : ''}`;
      b.classList.toggle('solved', done);
      b.classList.toggle('started', started);
      b.classList.toggle('current', current?.pack === pi && current.level === li);
      b.setAttribute('aria-label', `Level ${li + 1}${done ? ', solved' : started ? ', started' : ''}`);
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

for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  b.addEventListener('click', () => {
    // Play with nothing chosen yet starts on the first unsolved level (of the pack last played, if any).
    if (b.dataset.tab === 'play' && !currentCode) openLevel(firstUnsolved(PACKS.findIndex((k) => k.name === state.pack)));
    else setTab(b.dataset.tab as Tab);
  });
}

/** The first unsolved level, in pack `from` if it has one, else in any pack. */
function firstUnsolved(from = -1): LevelRef {
  if (PACKS[from]) {
    const level = PACKS[from].levels.findIndex((c) => !storage.isSolved(c));
    if (level >= 0) return { pack: from, level };
  }
  for (let pack = 0; pack < PACKS.length; pack++) {
    const level = PACKS[pack].levels.findIndex((c) => !storage.isSolved(c));
    if (level >= 0) return { pack, level };
  }
  return { pack: 0, level: 0 };
}

// Share the puzzle on the board (or open one); while playing, copy or clear its solve log.
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

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    play.render();
    play.setAutoCheck(s.autoCheck);
    storage.saveSettings(s);
  }, exportSolveLogs);
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
  history.replaceState(null, '', location.pathname + location.search);
  if (!p) return false;
  const code = encodePuzzle(p);
  const ref = findLevel(code);
  if (ref) openLevel(ref);
  else load(p, code, undefined);
  return true;
}

window.addEventListener('hashchange', () => void openLink());

// Save the board when the page is hidden (phones often discard background tabs).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/**
 * Opening the app: a link's puzzle, or else the Levels tab at the pack last played (open, and
 * scrolled to), rather than a level, since packs and levels may have been reordered.
 */
function start() {
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

start();
