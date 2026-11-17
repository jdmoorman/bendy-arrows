import './style.css';
import { EditorView } from './editor';
import { clonePuzzle, puzzlesEqual, type Puzzle } from './model';
import { PlayView } from './play';
import { samplePuzzle } from './samples';
import { applyTheme, DEFAULT_THEME } from './themes';

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
  </header>
  <main class="views"></main>
`;

const views = app.querySelector('.views')!;
const play = new PlayView();
const editor = new EditorView();
views.append(play.el, editor.el);

/** The puzzle currently loaded in the play view. */
let playing: Puzzle = samplePuzzle();
let tab: Tab = 'play';

play.load(playing);
editor.load(playing);

editor.onPlay = () => setTab('play');

function setTab(t: Tab) {
  tab = t;
  if (t === 'play' && !puzzlesEqual(playing, editor.current)) {
    // Keep whatever progress still fits the edited puzzle.
    playing = clonePuzzle(editor.current);
    play.load(playing, play.progress);
  }
  play.el.classList.toggle('hidden', t !== 'play');
  editor.el.classList.toggle('hidden', t !== 'edit');
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
  }
}

for (const b of app.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
  b.addEventListener('click', () => setTab(b.dataset.tab as Tab));
}

document.addEventListener('keydown', (ev) => {
  const target = ev.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  const handled = tab === 'play' ? play.handleKey(ev) : editor.handleKey(ev);
  if (handled) ev.preventDefault();
});

setTab('play');
