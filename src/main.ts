import './style.css';
import { attachUniquenessCheck } from './check-ui';
import { checkSolution } from './rules';
import { decodePuzzle, encodePuzzle } from './codec';
import { EditorView } from './editor';
import { ICONS } from './icons';
import { LibraryView } from './library-view';
import { clonePuzzle, createPuzzle, puzzlesEqual, type Puzzle } from './model';
import { PlayView, type Progress } from './play';
import { LEVELS } from './levels';
import { LOCAL_SAMPLES } from './samples';
import { openSaveSheet } from './save-ui';
import { openShareSheet, puzzleFromHash } from './share';
import { openSettingsSheet, applySettings } from './settings-ui';
import { Storage } from './storage';
import { openSolvedSheet } from './solved-ui';
import { applyTheme, DEFAULT_THEME } from './themes';
import { toast } from './ui';

applyTheme(DEFAULT_THEME);

type Tab = 'play' | 'edit' | 'library';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <h1 class="app-title">BendyArrows</h1>
    <div class="segmented tabs" role="tablist" aria-label="Mode">
      <button class="seg-btn" role="tab" data-tab="play">Play</button>
      <button class="seg-btn" role="tab" data-tab="edit">Create</button>
      <button class="seg-btn" role="tab" data-tab="library">Library</button>
    </div>
    <button class="btn icon" data-act="share" aria-label="Share or open a puzzle">${ICONS.share}</button>
    <button class="btn icon" data-act="settings" aria-label="Settings">${ICONS.settings}</button>
  </header>
  <main class="views"></main>
`;

const storage = new Storage();
let settings = storage.loadSettings();
applySettings(settings);
const views = app.querySelector('.views')!;
const titleEl = app.querySelector<HTMLElement>('.app-title')!;
const play = new PlayView();
const editor = new EditorView();
const library = new LibraryView(storage);
views.append(play.el, editor.el, library.el);
play.setAutoCheck(settings.autoCheck);

/** The puzzle currently loaded in the play view, and where it came from. */
let playing: Puzzle = createPuzzle(6, 6);
let playingCode = encodePuzzle(playing);
let libraryId: string | undefined;
let puzzleName: string | undefined;
let tab: Tab = 'play';
/** The last of Play and Create to be shown, so the Library knows which puzzle is "current". */
let lastBoardTab: 'play' | 'edit' = 'play';
let ready = false;

/** Switch to Play at the user's request, unless the puzzle being edited isn't ready. */
function requestPlay() {
  // Play takes up the editor's puzzle (or already has it), so it must have its ends or numbers.
  if (!editor.checkPlayable()) {
    setTab('edit');
    return;
  }
  // Lines and X's from the editor's logic steps carry over to the Play board.
  const marks = tab === 'edit' ? editor.logicMarks : null;
  setTab('play');
  if (marks) play.setMarks(marks);
}

editor.onPlay = requestPlay;
attachUniquenessCheck(editor);

play.onSolved = () => {
  storage.markSolved(playingCode);
  openSolvedSheet({
    onPlayAgain: () => play.playAgain(),
    onAnotherPuzzle: openLibrary,
  });
};

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
  puzzleName = meta.name ?? saved?.name ?? [...LEVELS, ...LOCAL_SAMPLES].find((s) => s.code === playingCode)?.name;
  play.load(playing, meta.progress ?? saved?.progress);
  editor.load(playing);
  updateHeader();
  // A puzzle without its ends (or numbers), e.g. from an old link or session, opens in Create.
  setTab(startTab === 'play' && !editor.checkPlayable() ? 'edit' : startTab);
}

function updateHeader() {
  titleEl.textContent = puzzleName ?? 'BendyArrows';
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
    // An edited puzzle is a new puzzle: keep the marks that still fit.
    // A replaced, resized or turned puzzle starts with an empty board.
    const { segments, xMarks } = play.progress;
    play.load(playing, saved?.progress ?? (editor.marksStillFit ? { segments, xMarks } : undefined));
    editor.marksStillFit = true;
    updateHeader();
  }
  if (t !== 'library') lastBoardTab = t;
  play.el.classList.toggle('hidden', t !== 'play');
  editor.el.classList.toggle('hidden', t !== 'edit');
  library.el.classList.toggle('hidden', t !== 'library');
  if (t === 'library') {
    library.currentCode = playingCode;
    library.refresh();
  }
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
  }
  saveSession();
}

for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  b.addEventListener('click', () => (b.dataset.tab === 'play' ? requestPlay() : setTab(b.dataset.tab as Tab)));
}

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    // Coordinates change the board's margin, so redraw both boards.
    play.render();
    editor.render();
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

/** Show the Library tab (also used to pick another puzzle after solving). */
function openLibrary() {
  setTab('library');
}

/** Save the editor's puzzle, or the one being played, to the library. */
function saveCurrent(fromEditor: boolean) {
  const editing = fromEditor && !puzzlesEqual(playing, editor.current);
  // A puzzle needs its ends (or numbers) before it can be saved; the editor says what's missing.
  if (editing && !editor.checkPlayable()) {
    setTab('edit');
    return;
  }
  openSaveSheet({
    storage,
    current: editing ? editor.current : playing,
    progress: editing ? undefined : play.progress,
    solved: editing ? undefined : play.isSolved,
    currentId: editing ? undefined : libraryId,
    onSaved: (entry) => {
      if (editing) {
        // Saving the editor's puzzle makes it the current puzzle.
        loadPuzzle(decodePuzzle(entry.code), { id: entry.id, name: entry.name, progress: entry.progress }, tab);
      } else if (entry.code === playingCode) {
        libraryId = entry.id;
        puzzleName = entry.name;
        updateHeader();
        saveSession();
      }
      if (tab === 'library') library.refresh();
    },
  });
}

editor.onSave = () => saveCurrent(true);
library.onSave = () => saveCurrent(lastBoardTab === 'edit');
library.onOpen = ({ puzzle, progress, id, name }, t) => {
  // A finished puzzle opens with an empty board for Play.
  const finished = !!progress && checkSolution(puzzle, new Set(progress.segments)).solved;
  const fresh: Progress = { segments: [], xMarks: [] };
  loadPuzzle(puzzle, { progress: t === 'play' && finished ? fresh : progress, id, name }, t);
};
library.onDeleted = (id) => {
  if (libraryId === id) {
    libraryId = undefined;
    saveSession();
  }
};

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  if (document.querySelector('dialog[open]') || tab === 'library') return;
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
  } else if (LOCAL_SAMPLES.length) {
    loadPuzzle(decodePuzzle(LOCAL_SAMPLES[0].code));
  } else {
    // First visit, with no samples to start on: open the library, where the daily puzzle is.
    loadPuzzle(createPuzzle(6, 6), {}, 'library');
  }
  if (session?.tab === 'edit' && session.editorCode && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) {
    try {
      editor.load(decodePuzzle(session.editorCode));
      // We can't tell how much it was changed before the reload, so don't carry marks over.
      editor.marksStillFit = false;
    } catch {
      /* ignore stale editor state */
    }
  }
  if (session?.tab && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) setTab(session.tab === 'play' && !editor.checkPlayable() ? 'edit' : session.tab);
  ready = true;
  saveSession();
}

start();
