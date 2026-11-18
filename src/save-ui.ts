import { encodePuzzle } from './codec';
import { ICONS } from './icons';
import type { Puzzle } from './model';
import type { Progress } from './play';
import { newId, type LibraryEntry, type Storage } from './storage';
import { el, openSheet, toast } from './ui';

export interface SaveContext {
  storage: Storage;
  /** The puzzle to save. */
  current: Puzzle;
  progress?: Progress;
  solved?: boolean;
  /** Library entry the puzzle was opened from, if any. */
  currentId?: string;
  onSaved(entry: LibraryEntry): void;
}

export function defaultName(p: Puzzle): string {
  return `Path ${p.w}×${p.h}`;
}

/** Save a puzzle to the library under a name (or update the entry it came from). */
export function openSaveSheet(ctx: SaveContext): void {
  const { storage } = ctx;
  const body = el('div', 'sheet-stack');
  const existing = ctx.currentId ? storage.get(ctx.currentId) : undefined;
  const sheet = openSheet(existing ? 'Update saved puzzle' : 'Save puzzle', body);
  const code = encodePuzzle(ctx.current);

  const nameInput = el('input', 'text-input') as HTMLInputElement;
  nameInput.value = existing?.name ?? defaultName(ctx.current);
  nameInput.setAttribute('aria-label', 'Puzzle name');
  nameInput.maxLength = 60;
  const save = (asNew: boolean) => {
    const name = nameInput.value.trim() || defaultName(ctx.current);
    const now = Date.now();
    const keepProgress = !asNew && existing?.code === code;
    const entry: LibraryEntry = {
      id: asNew || !existing ? newId() : existing.id,
      name,
      code,
      created: asNew || !existing ? now : existing.created,
      updated: now,
      progress: ctx.progress ?? (keepProgress ? existing?.progress : undefined),
      solved: ctx.solved ?? (keepProgress ? existing?.solved : false),
      collection: asNew ? undefined : existing?.collection,
    };
    if (!storage.put(entry)) {
      toast('Could not save — browser storage is unavailable', 'error');
      return;
    }
    ctx.onSaved(entry);
    toast(`Saved “${name}”`);
    sheet.close();
  };
  const row = el('div', 'sheet-row');
  if (existing) {
    const asNewBtn = el('button', 'btn', '<span>Save as new</span>');
    asNewBtn.addEventListener('click', () => save(true));
    row.append(asNewBtn);
  }
  const saveBtn = el('button', 'btn primary', `${ICONS.save}<span>${existing ? 'Update' : 'Save'}</span>`);
  saveBtn.addEventListener('click', () => save(false));
  row.append(saveBtn);
  nameInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') save(false);
  });
  body.append(el('p', 'field-label', 'Name'), nameInput, row);
  if (!storage.available) {
    saveBtn.disabled = true;
    body.append(el('p', 'field-label', 'Browser storage is unavailable, so saving is disabled.'));
  }
}
