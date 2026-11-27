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
  /** For a new entry: the name to store (a pack level's), and the collection to put it in. */
  suggestedName?: string;
  collection?: string;
  onSaved(entry: LibraryEntry): void;
}

export function defaultName(p: Puzzle): string {
  return `Path ${p.w}×${p.h}`;
}

/**
 * Save a puzzle to the library: a new one straight away; one opened from the library asks whether
 * to update it or save a new copy. (Puzzles go unnamed: their cards show what they look like; the
 * stored name is only a fallback for exports.)
 */
export function openSaveSheet(ctx: SaveContext): void {
  const { storage } = ctx;
  if (!storage.available) {
    toast('Could not save — browser storage is unavailable', 'error');
    return;
  }
  const existing = ctx.currentId ? storage.get(ctx.currentId) : undefined;
  const code = encodePuzzle(ctx.current);
  const save = (asNew: boolean): boolean => {
    const now = Date.now();
    const keepProgress = !asNew && existing?.code === code;
    const entry: LibraryEntry = {
      id: asNew || !existing ? newId() : existing.id,
      name: (!asNew && existing?.name) || ctx.suggestedName || defaultName(ctx.current),
      code,
      created: asNew || !existing ? now : existing.created,
      updated: now,
      progress: ctx.progress ?? (keepProgress ? existing?.progress : undefined),
      solved: ctx.solved ?? (keepProgress ? existing?.solved : false),
      collection: asNew || !existing ? ctx.collection : existing.collection,
    };
    if (!storage.put(entry)) {
      toast('Could not save — browser storage is unavailable', 'error');
      return false;
    }
    ctx.onSaved(entry);
    toast(asNew || !existing ? 'Saved to your Library' : 'Updated in your Library');
    return true;
  };
  if (!existing) {
    save(true);
    return;
  }
  const body = el('div', 'sheet-stack');
  const sheet = openSheet('Update saved puzzle', body);
  const row = el('div', 'sheet-row');
  const asNewBtn = el('button', 'btn', '<span>Save as new</span>');
  asNewBtn.addEventListener('click', () => save(true) && sheet.close());
  const saveBtn = el('button', 'btn primary', `${ICONS.save}<span>Update</span>`);
  saveBtn.addEventListener('click', () => save(false) && sheet.close());
  row.append(asNewBtn, saveBtn);
  body.append(row);
}
