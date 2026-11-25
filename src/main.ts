import './levels-sync';
import './style.css';
import { attachUniquenessCheck } from './check-ui';
import { checkSolution } from './rules';
import { decodePuzzle, encodePuzzle, plainCode } from './codec';
import { EditorView } from './editor';
import { ICONS } from './icons';
import { LibraryView } from './library-view';
import { PacksView } from './packs-view';
import { clonePuzzle, createPuzzle, puzzlesEqual, type Puzzle } from './model';
import { PlayView, type Progress } from './play';
import { allLogsText, puzzleLogText } from './solve-log';
import { findLevel, levelName, PACKS, type LevelRef } from './levels';
import { openSaveSheet } from './save-ui';
import { download, hashWantsEditor, openShareSheet, puzzleFromHash } from './share';
import { openSettingsSheet, applySettings } from './settings-ui';
import { Storage } from './storage';
import { applyTheme, DEFAULT_THEME } from './themes';
import { solveInBackground } from './solver-client';
import { levelCode } from './rating-client';
import { el, openSheet, toast } from './ui';

// --- Back button ---------------------------------------------------------------
// Each change of tab is a browser history entry, so Back returns to the previous tab. While
// starting up or going back, tabs change without adding entries.
let restoringTab = true;
function rememberTab(t: string) {
  if (restoringTab || (history.state as { tab?: string } | null)?.tab === t) return;
  history.pushState({ tab: t }, '', location.href);
}
window.addEventListener('popstate', (ev) => {
  const t = (ev.state as { tab?: Tab } | null)?.tab;
  if (!t) return;
  restoringTab = true;
  goBackTo(t);
  restoringTab = false;
});

applyTheme(DEFAULT_THEME);

type Tab = 'play' | 'edit' | 'library' | 'packs';

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="app-header">
    <h1 class="app-title">BendyArrows</h1>
    <div class="segmented tabs" role="tablist" aria-label="Mode">
      <button class="seg-btn" role="tab" data-tab="play">Play</button>
      <button class="seg-btn" role="tab" data-tab="edit">Create</button>
      <button class="seg-btn" role="tab" data-tab="library">Library</button>
      ${import.meta.env.DEV ? '<button class="seg-btn" role="tab" data-tab="packs">Packs</button>' : ''}
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
// The pack organiser saves through the local dev server, so only it has one (and the
// published site's bundle leaves it out).
const packs = import.meta.env.DEV ? new PacksView(storage) : null;
views.append(play.el, editor.el, library.el);
if (packs) {
  views.append(packs.el);
  packs.onOpen = (code) => loadPuzzle(decodePuzzle(code), {}, 'edit');
}
play.setAutoCheck(settings.autoCheck);
play.setHintMoves(settings.hintMoves);
play.setWinAnimation(settings.winAnimation);

/** The puzzle currently loaded in the play view, and where it came from. */
let playing: Puzzle = createPuzzle(6, 6);
let playingCode = encodePuzzle(playing);
let libraryId: string | undefined;
let puzzleName: string | undefined;
/** Made with New puzzle or Generate and not saved yet: the title says "New puzzle" until it's saved with a name. */
let unnamed = false;
/**
 * The pack level the puzzle was opened from (it stays through edits), when it isn't linked to
 * a Library entry: saving it makes a Library copy named after the level, in the pack's collection.
 */
let fromLevel: LevelRef | undefined;
let tab: Tab = 'play';
/** The last of Play and Create to be shown, so the Library knows which puzzle is "current". */
let lastBoardTab: 'play' | 'edit' = 'play';
let ready = false;

/** Switch to Play at the user's request, unless the puzzle being edited isn't ready. */
function requestPlay() {
  // Play takes up the editor's puzzle (or already has it), so it must have its ends.
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
  if (play.gold) storage.markGold(playingCode);
};
// Solved: Another puzzle (the Library) beside Reset.
play.solvedAction = () => ({ label: 'Another puzzle', run: () => setTab('library') });

play.onProgress = (progress, solved) => {
  if (libraryId) storage.updateProgress(libraryId, playingCode, progress, solved);
  saveSession();
};
editor.changeListeners.push(() => {
  // New puzzle or Generate: the title says so until it's saved with a name.
  if (editor.replaced && !unnamed) {
    unnamed = true;
    updateHeader();
  }
  saveSession();
});

interface LoadMeta {
  progress?: Progress;
  id?: string;
  name?: string;
}

/** Make `p` the current puzzle in both views. */
function loadPuzzle(p: Puzzle, meta: LoadMeta = {}, startTab: Tab = 'play') {
  playing = clonePuzzle(p);
  playingCode = encodePuzzle(playing);
  // A puzzle that is already in the library picks up its saved name and progress; a pack level
  // stays unlinked from saved copies that share its code (unless one was opened on purpose).
  const level = findLevel(playingCode);
  const saved = meta.id ? storage.get(meta.id) : level ? undefined : storage.findByCode(playingCode);
  libraryId = saved && saved.code === playingCode ? saved.id : undefined;
  fromLevel = libraryId ? undefined : level;
  puzzleName = meta.name ?? saved?.name ?? (level ? levelName(level) : undefined);
  unnamed = false;
  play.load(playing, meta.progress ?? saved?.progress);
  editor.load(playing);
  updateHeader();
  // A puzzle without its ends, e.g. from an old link or session, opens in Create.
  setTab(startTab === 'play' && !editor.checkPlayable() ? 'edit' : startTab);
}

function updateHeader() {
  titleEl.textContent = unnamed ? 'New puzzle' : (puzzleName ?? 'BendyArrows');
  const code = encodePuzzle(playing);
  const hash = `#p=${code}`;
  if (location.hash !== hash) history.replaceState(history.state, '', hash);
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
    editorReplaced: editorCode !== playingCode && editor.replaced ? true : undefined,
    unnamed: unnamed || undefined,
    tab,
  });
}

function setTab(t: Tab) {
  // E.g. a session saved on the dev server, opened where there's no pack organiser.
  if (t === 'packs' && !packs) t = 'library';
  rememberTab(t);
  tab = t;
  if (t === 'play' && !puzzlesEqual(playing, editor.current)) {
    // Keep whatever progress still fits the edited puzzle; it is a new puzzle now.
    playing = clonePuzzle(editor.current);
    playingCode = encodePuzzle(playing);
    // New puzzle or Generate replaced it: it no longer comes from a pack level.
    if (editor.replaced) fromLevel = undefined;
    const level = findLevel(playingCode);
    const saved = level ? undefined : storage.findByCode(playingCode);
    libraryId = saved?.id;
    if (libraryId) fromLevel = undefined;
    else if (level) fromLevel = level;
    puzzleName = saved?.name ?? (level ? levelName(level) : undefined);
    // A new puzzle stays "New puzzle" until it's saved (or turns out to be one that was).
    if (saved || level) unnamed = false;
    // An edited puzzle is a new puzzle: keep the marks that still fit.
    // A replaced, resized or turned puzzle starts with an empty board.
    const { segments, xMarks } = play.progress;
    play.load(playing, saved?.progress ?? (editor.marksStillFit ? { segments, xMarks } : undefined));
    editor.marksStillFit = true;
    editor.replaced = false;
    updateHeader();
  }
  if (t === 'play' || t === 'edit') lastBoardTab = t;
  play.el.classList.toggle('hidden', t !== 'play');
  editor.el.classList.toggle('hidden', t !== 'edit');
  library.el.classList.toggle('hidden', t !== 'library');
  packs?.el.classList.toggle('hidden', t !== 'packs');
  if (t === 'packs') packs?.show();
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
  const name = puzzleName;
  const text = playingCode ? puzzleLogText(playingCode, name) : '';
  if (!text) return undefined;
  return () => download(`solve-log-${(name || playingCode).replace(/[^\w-]+/g, '-')}.txt`, text, 'text/plain');
}

app.querySelector('[data-act=settings]')!.addEventListener('click', () => {
  openSettingsSheet(settings, (s) => {
    settings = s;
    applySettings(s);
    // Coordinates change the board's margin, so redraw both boards.
    play.render();
    editor.render();
    play.setAutoCheck(s.autoCheck);
    play.setHintMoves(s.hintMoves);
    play.setWinAnimation(s.winAnimation);
    storage.saveSettings(s);
  }, hasLogs() ? exportSolveLogs : undefined, exportPuzzleLog());
});

app.querySelector('[data-act=share]')!.addEventListener('click', () => {
  openShareSheet({
    puzzle: tab === 'edit' ? editor.current : playing,
    name: tab === 'edit' ? undefined : puzzleName,
    onOpen: (p) => loadPuzzle(p),
  });
});

/** Save the editor's puzzle, or the one being played, to the library. */
function saveCurrent(fromEditor: boolean, toLibrary = false) {
  const editing = fromEditor && !puzzlesEqual(playing, editor.current);
  // A puzzle needs its ends before it can be saved; the editor says what's missing.
  if (editing && !editor.checkPlayable()) {
    setTab('edit');
    return;
  }
  // Running locally, a pack level saves back into src/levels.ts.
  const level = fromLevel && !(editing && editor.replaced) ? fromLevel : undefined;
  if (import.meta.env.DEV && level && !toLibrary) {
    openLevelSaveSheet(level, editing ? editor.current : playing, fromEditor);
    return;
  }
  openSaveSheet({
    storage,
    current: editing ? editor.current : playing,
    progress: editing ? undefined : play.progress,
    solved: editing ? undefined : play.isSolved,
    // An edited puzzle still came from this entry, so offer to update it (or save as new),
    // unless New puzzle or Generate replaced it with a different one.
    currentId: editing && editor.replaced ? undefined : libraryId,
    // An edited (or unedited) pack level saves as a Library copy named after the level.
    suggestedName: fromLevel && !(editing && editor.replaced) ? levelName(fromLevel) : undefined,
    collection: fromLevel && !(editing && editor.replaced) ? PACKS[fromLevel.pack].name : undefined,
    onSaved: (entry) => {
      if (editing) {
        // Saving the editor's puzzle makes it the current puzzle.
        loadPuzzle(decodePuzzle(entry.code), { id: entry.id, name: entry.name, progress: entry.progress }, tab);
      } else if (entry.code === playingCode) {
        libraryId = entry.id;
        puzzleName = entry.name;
        unnamed = false;
        updateHeader();
        saveSession();
      }
      if (tab === 'library') library.refresh();
    },
  });
}

/** Save over a pack level in src/levels.ts (the local dev server does the writing). */
function openLevelSaveSheet(level: LevelRef, p: Puzzle, fromEditor: boolean) {
  const from = PACKS[level.pack].levels[level.level];
  const plain = encodePuzzle(p);
  const unchanged = plain === plainCode(from);
  const body = el('div', 'sheet-stack');
  const note = el('p', 'field-label');
  // Either way up is fine for a level (that's the pack's business), but not too long and thin.
  const thin = Math.max(p.w, p.h) > 2 * Math.min(p.w, p.h);
  note.textContent =
    unchanged
      ? `${levelName(level)} is unchanged.`
      : thin
        ? `A level is at most twice as long as it is wide, and this puzzle is ${p.w}×${p.h}.`
        : `Replace ${levelName(level)} in src/levels.ts with this puzzle.`;
  const row = el('div', 'sheet-row');
  const copy = el('button', 'btn', '<span>Save to Library</span>');
  const update = el('button', 'btn primary', `${ICONS.save}<span>Update level</span>`);
  update.disabled = unchanged || thin;
  row.append(copy, update);
  body.append(note, row);
  const sheet = openSheet(`Save ${levelName(level)}`, body);
  copy.addEventListener('click', () => {
    sheet.close();
    saveCurrent(fromEditor, true);
  });
  update.addEventListener('click', async () => {
    update.disabled = true;
    try {
      // A level must keep exactly one solution (the tests refuse anything else).
      const r = await solveInBackground(p, undefined, { maxSolutions: 2 }).result;
      if (r.status !== 'unique') throw new Error('A level needs exactly one solution.');
      // A level's code carries its difficulty.
      const to = await levelCode(plain);
      const res = await fetch('/__levels', { method: 'POST', body: JSON.stringify({ from, to }) });
      const reply = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !reply.ok) throw new Error(reply.error ?? 'The dev server refused the change.');
      // The packs in memory follow the file until Vite reloads the page with it.
      PACKS[level.pack].levels[level.level] = to;
      sheet.close();
      loadPuzzle(p, {}, tab);
      toast(`Updated ${levelName(level)} in src/levels.ts.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      update.disabled = thin;
    }
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
  if (document.querySelector('dialog[open]') || tab === 'library' || tab === 'packs') return;
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
  // Read before loading: loading writes the plain "#p=CODE" back to the address.
  const edit = hashWantsEditor(location.hash);
  const p = puzzleFromLocation();
  if (p && !puzzlesEqual(p, playing)) loadPuzzle(p, {}, edit ? 'edit' : 'play');
  else if (p && edit) setTab('edit');
  if (edit) updateHeader(); // drop "&edit" from the address once it's done its job
});

// Save progress when the page is hidden (phones often discard background tabs).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveSession();
});

/** Back to a tab, as it was left. */
function goBackTo(t: Tab) {
  setTab(t);
}

function start() {
  const fromLink = puzzleFromLocation();
  // Read before loading: loading writes the plain "#p=CODE" back to the address.
  const wantsEditor = hashWantsEditor(location.hash);
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
    // First visit: open the library, where the levels are.
    loadPuzzle(createPuzzle(6, 6), {}, 'library');
  }
  // The address always holds the current puzzle, so a reload looks like a link: only a reload
  // goes back to the tab you were on (and its unsaved editor work). A link opened anew (e.g.
  // from the Library into a new tab) opens in Play, or in the editor when it ends in "&edit".
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const reload = nav?.type === 'reload' || !fromLink;
  if (reload && session?.tab === 'edit' && session.editorCode && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) {
    try {
      editor.load(decodePuzzle(session.editorCode));
      // We can't tell how much it was changed before the reload, so don't carry marks over.
      editor.marksStillFit = false;
      editor.replaced = !!session.editorReplaced;
    } catch {
      /* ignore stale editor state */
    }
  }
  if (reload && session?.tab && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle)) {
    setTab(session.tab === 'play' && !editor.checkPlayable() ? 'edit' : session.tab);
  }
  if (fromLink && wantsEditor) setTab('edit');
  if (reload && sessionPuzzle && puzzlesEqual(playing, sessionPuzzle) && (session?.unnamed || editor.replaced)) unnamed = true;
  updateHeader();
  ready = true;
  saveSession();
}

start();
// The first history entry is the tab the app opened on.
history.replaceState({ tab }, '', location.href);
restoringTab = false;
