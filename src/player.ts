import './style.css';
import { decodePuzzle, encodePuzzle } from './codec';
import { ICONS } from './icons';
import { findLevel, levelName, PACKS, type LevelRef } from './levels';
import type { Puzzle } from './model';
import { PlayView } from './play';
import { puzzleFromHash } from './share';
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
play.setOneStroke(settings.oneStroke);

const state: PlayerState = storage.loadPlayer();
/** The level on the board, or none for a puzzle opened from a link. */
let current: LevelRef | undefined;
let currentCode = '';
let tab: Tab = 'levels';

const valid = (ref: LevelRef | undefined): ref is LevelRef => !!ref && !!PACKS[ref.pack]?.levels[ref.level];

function save() {
  state.current = current;
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

/** The packs, each with its levels as numbered buttons: solved ones ticked, the current one marked. */
function drawLevels() {
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
    const name = el('h2', 'pack-name');
    head.append(el('span', 'pack-chevron', ICONS.chevron));
    name.textContent = pack.name;
    const count = el('span', 'pack-count', `${solved} of ${pack.levels.length} solved`);
    head.append(name, count);
    const desc = el('p', 'pack-desc');
    desc.textContent = pack.description;
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
    section.append(head, desc, grid);
    return section;
  });
  levels.replaceChildren(...packs);
}

for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  b.addEventListener('click', () => {
    // Play with nothing chosen yet starts on the first unsolved level.
    if (b.dataset.tab === 'play' && !currentCode) openLevel(firstUnsolved());
    else setTab(b.dataset.tab as Tab);
  });
}

function firstUnsolved(): LevelRef {
  for (let pack = 0; pack < PACKS.length; pack++) {
    const level = PACKS[pack].levels.findIndex((c) => !storage.isSolved(c));
    if (level >= 0) return { pack, level };
  }
  return { pack: 0, level: 0 };
}

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    play.render();
    play.setAutoCheck(s.autoCheck);
    play.setOneStroke(s.oneStroke);
    storage.saveSettings(s);
  });
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

function start() {
  if (location.hash && openLink()) return;
  if (valid(state.current)) {
    openLevel(state.current);
    if (state.tab === 'levels') setTab('levels');
  } else {
    setTab('levels');
  }
}

start();
