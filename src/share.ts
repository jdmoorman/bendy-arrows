import { decodePuzzle, encodePuzzle, puzzleFromJson } from './codec';
import { ICONS } from './icons';
import type { Puzzle } from './model';
import { el, openSheet, toast } from './ui';

/** Link that opens this puzzle in the app. */
export function shareUrl(p: Puzzle): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = `p=${encodePuzzle(p)}`;
  return url.toString();
}

/** Puzzle encoded in a URL hash like "#p=CODE", if any. */
export function puzzleFromHash(hash: string): Puzzle | null {
  const m = /(?:^#|&)p=([A-Za-z0-9_-]+)/.exec(hash);
  return m ? decodePuzzle(m[1]) : null;
}

/** The link asks for the editor ("#p=CODE&edit") rather than Play. */
export function hashWantsEditor(hash: string): boolean {
  return /(?:^#|&)edit(?:&|$)/.test(hash);
}

/** Accept a full link, a "#p=…" fragment, a bare code, or JSON text. */
export function puzzleFromText(text: string): Puzzle {
  const t = text.trim();
  if (!t) throw new Error('Paste a puzzle link or code first.');
  if (t.startsWith('{')) return puzzleFromJson(JSON.parse(t));
  const hashAt = t.indexOf('#');
  if (hashAt >= 0) {
    const p = puzzleFromHash(t.slice(hashAt));
    if (p) return p;
  }
  const m = /[?&]p=([A-Za-z0-9_-]+)/.exec(t);
  return decodePuzzle(m ? m[1] : t);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(filename: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The share / import sheet. */
export function openShareSheet(opts: { puzzle: Puzzle; name?: string; onOpen: (p: Puzzle) => void }): void {
  const { puzzle } = opts;
  const url = shareUrl(puzzle);
  const body = el('div', 'sheet-stack');

  const linkBox = el('input', 'text-input') as HTMLInputElement;
  linkBox.readOnly = true;
  linkBox.value = url;
  linkBox.setAttribute('aria-label', 'Puzzle link');
  linkBox.addEventListener('focus', () => linkBox.select());

  const shareRow = el('div', 'sheet-row');
  const canNativeShare = typeof navigator.share === 'function';
  const shareBtn = el('button', 'btn primary', `${ICONS.share}<span>${canNativeShare ? 'Share' : 'Copy link'}</span>`);
  shareBtn.addEventListener('click', async () => {
    if (canNativeShare) {
      try {
        await navigator.share({ title: opts.name || 'BendyArrows puzzle', url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    toast((await copyText(url)) ? 'Link copied' : 'Could not copy — select the link and copy it', '');
  });
  shareRow.append(shareBtn);
  if (canNativeShare) {
    const copyBtn = el('button', 'btn', '<span>Copy link</span>');
    copyBtn.addEventListener('click', async () => toast((await copyText(url)) ? 'Link copied' : 'Could not copy'));
    shareRow.append(copyBtn);
  }

  const openLabel = el('p', 'field-label', 'Open a puzzle from a link or code');
  const openRow = el('div', 'sheet-row');
  const openInput = el('input', 'text-input') as HTMLInputElement;
  openInput.placeholder = 'Paste link or code';
  openInput.autocapitalize = 'off';
  openInput.spellcheck = false;
  const openBtn = el('button', 'btn', '<span>Open</span>');
  openBtn.style.flex = '0 0 auto';
  const doOpen = () => {
    try {
      const p = puzzleFromText(openInput.value);
      sheet.close();
      opts.onOpen(p);
      toast('Puzzle opened');
    } catch (err) {
      toast(`Could not open: ${(err as Error).message}`, 'error');
    }
  };
  openBtn.addEventListener('click', doOpen);
  openInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') doOpen();
  });
  openRow.append(openInput, openBtn);

  body.append(linkBox, shareRow, el('hr', 'sheet-sep'), openLabel, openRow);
  const sheet = openSheet('Share puzzle', body);
}
