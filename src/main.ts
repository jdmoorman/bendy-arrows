import './style.css';
import { attachUniquenessCheck } from './check-ui';
import { decodePuzzle, encodePuzzle } from './codec';
import { EditorView } from './editor';
import { ICONS } from './icons';
import { openLibrarySheet } from './library-ui';
import { clonePuzzle, puzzlesEqual, type Puzzle } from './model';
import { PlayView, type Progress } from './play';
import { SAMPLES, samplePuzzle } from './samples';
import { openShareSheet, puzzleFromHash } from './share';
import { openSettingsSheet, applySettings } from './settings-ui';
import { Storage } from './storage';
import { LocalLeaderboard } from './leaderboard';
import { openSolvedSheet } from './solved-ui';
import { applyTheme, DEFAULT_THEME } from './themes';
import { toast } from './ui';

applyTheme(DEFAULT_THEME);

type Tab = 'play' | 'edit';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <h1 class="app-title">Hamiltonian</h1>
    <div class="segmented tabs" role="tablist" aria-label="Mode">
      <button class="seg-btn" role="tab" data-tab="play">Play</button>
      <button class="seg-btn" role="tab" data-tab="edit">Create</button>
    </div>
    <button class="btn icon" data-act="library" aria-label="Library">${ICONS.library}</button>
    <button class="btn icon" data-act="share" aria-label="Share or open a puzzle">${ICONS.share}</button>
    <button class="btn icon" data-act="settings" aria-label="Settings">${ICONS.settings}</button>
  </header>
  <main class="views"></main>
`;

const storage = new Storage();
let settings = storage.loadSettings();
const leaderboard = new LocalLeaderboard(storage);
applySettings(settings);
const views = app.querySelector('.views')!;
const titleEl = app.querySelector<HTMLElement>('.app-title')!;
const play = new PlayView();
const editor = new EditorView();
views.append(play.el, editor.el);
play.setShowTimer(settings.showTimer);
play.setAutoCheck(settings.autoCheck);

/** The puzzle currently loaded in the play view, and where it came from. */
let playing: Puzzle = samplePuzzle();
let playingCode = encodePuzzle(playing);
let libraryId: string | undefined;
let puzzleName: string | undefined;
let tab: Tab = 'play';
let ready = false;

/** Switch to Play at the user's request, unless the puzzle being edited isn't ready. */
function requestPlay() {
  if (tab === 'edit' && !editor.checkPlayable()) return;
  setTab('play');
}

editor.onPlay = requestPlay;
attachUniquenessCheck(editor);

play.onSolved = async (ms, stats) => {
  const code = playingCode;
  const result = await leaderboard.record(code, ms, stats);
  if (code !== playingCode) return;
  openSolvedSheet({ ms, result, boardTitle: leaderboard.title, onPlayAgain: () => play.playAgain() });
};

/** The timer runs only while Play is in front of the player. */
function updateTimerActivity() {
  play.setActive(tab === 'play' && document.visibilityState === 'visible');
}

play.onProgress = (progress, solved) => {
  if (libraryId) storage.updateProgress(libraryId, playingCode, progress, solved);
  saveSession();
};
editor.changeListeners.push(() => saveSession());

interface LoadMeta {
  progress?: Progress;
  id?: string;
  name?: string;
}

/** Make `p` the current puzzle in both views. */
function loadPuzzle(p: Puzzle, meta: LoadMeta = {}, startTab: Tab = 'play') {
  playing = clonePuzzle(p);
  playingCode = encodePuzzle(playing);
  // A puzzle that is already in the library picks up its saved name and progress.
  const saved = meta.id ? storage.get(meta.id) : storage.findByCode(playingCode);
  libraryId = saved && saved.code === playingCode ? saved.id : undefined;
  puzzleName = meta.name ?? saved?.name ?? SAMPLES.find((s) => s.code === playingCode)?.name;
  play.load(playing, meta.progress ?? saved?.progress);
  editor.load(playing);
  updateHeader();
  setTab(startTab);
}

function updateHeader() {
  titleEl.textContent = puzzleName ?? 'Hamiltonian';
  const code = encodePuzzle(playing);
  const hash = `#p=${code}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function saveSession() {
  if (!ready) return;
  const editorCode = encodePuzzle(editor.current);
  storage.saveSession({
    code: playingCode,
    progress: play.progress,
    libraryId,
    name: puzzleName,
    editorCode: editorCode !== playingCode ? editorCode : undefined,
    tab,
  });
}

function setTab(t: Tab) {
  tab = t;
  if (t === 'play' && !puzzlesEqual(playing, editor.current)) {
    // Keep whatever progress still fits the edited puzzle; it is a new puzzle now.
    playing = clonePuzzle(editor.current);
    playingCode = encodePuzzle(playing);
    const saved = storage.findByCode(playingCode);
    libraryId = saved?.id;
    puzzleName = saved?.name;
    // An edited puzzle is a new puzzle: keep the marks that still fit, but not the time.
    const { segments, xMarks } = play.progress;
    play.load(playing, saved?.progress ?? { segments, xMarks });
    updateHeader();
  }
  play.el.classList.toggle('hidden', t !== 'play');
  editor.el.classList.toggle('hidden', t !== 'edit');
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
  }
  updateTimerActivity();
  saveSession();
}

for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  b.addEventListener('click', () => (b.dataset.tab === 'play' ? requestPlay() : setTab('edit')));
}

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    play.setShowTimer(s.showTimer);
    play.setAutoCheck(s.autoCheck);
    storage.saveSettings(s);
  });
});

app.querySelector('[data-act=share]')!.addEventListener('click', () => {
  openShareSheet({
    puzzle: tab === 'edit' ? editor.current : playing,
    name: tab === 'edit' ? undefined : puzzleName,
    onOpen: (p) => loadPuzzle(p),
  });
});

app.querySelector('[data-act=library]')!.addEventListener('click', () => {
  const editing = tab === 'edit' && !puzzlesEqual(playing, editor.current);
  openLibrarySheet({
    storage,
    current: editing ? editor.current : playing,
    progress: editing ? undefined : play.progress,
    solved: editing ? undefined : play.isSolved,
    currentId: editing ? undefined : libraryId,
    onOpen: ({ puzzle, progress, id, name }, t) => loadPuzzle(puzzle, { progress, id, name }, t),
    onSaved: (entry) => {
      if (entry.code === playingCode || editing) {
        if (editing) {
          // Saving the editor's puzzle makes it the current puzzle.
          loadPuzzle(decodePuzzle(entry.code), { id: entry.id, name: entry.name, progress: entry.progress }, 'edit');
        } else {
          libraryId = entry.id;
          puzzleName = entry.name;
          updateHeader();
          saveSession();
        }
      }
    },
  });
});

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  if (document.querySelector('dialog[open]')) return;
  const handled = tab === 'play' ? play.handleKey(ev) : editor.handleKey(ev);
  if (handled) ev.preventDefault();
});

function puzzleFromLocation(): Puzzle | null {
  try {
    return puzzleFromHash(location.hash);
  } catch {
    toast("This link doesn't contain a valid puzzle.", 'error');
    return null;
  }
}

window.addEventListener('hashchange', () => {
  const p = puzzleFromLocation();
  if (p && !puzzlesEqual(p, playing)) loadPuzzle(p);
});

// Save progress when the page is hidden (phones often discard background tabs).
document.addEventListener('visibilitychange', () => {
  updateTimerActivity();
  if (document.visibilityState === 'hidden') saveSession();
});

function start() {
  const fromLink = puzzleFromLocation();
  const session = storage.loadSession();
  let sessionPuzzle: Puzzle | null = null;
  try {
    sessionPuzzle = session ? decodePuzzle(session.code) : null;
  } catch {
    sessionPuzzle = null;
  }
  if (fromLink) {
    const same = session && sessionPuzzle && puzzlesEqual(fromLink, sessionPuzzle);
    loadPuzzle(fromLink, same ? { progress: session.progress, id: session.libraryId, name: session.name } : {});
  } else if (session && sessionPuzzle) {
    loadPuzzle(sessionPuzzle, { progress: session.progress, id: session.libraryId, name: session.name });
  } else {
    loadPuzzle(samplePuzzle());
  }
  if (session?.tab === 'edit' && session.editorCode && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) {
    try {
      editor.load(decodePuzzle(session.editorCode));
    } catch {
      /* ignore stale editor state */
    }
  }
  if (session?.tab && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) setTab(session.tab);
  ready = true;
  saveSession();
}

start();
