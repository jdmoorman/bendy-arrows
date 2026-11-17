import { ICONS } from './icons';

/** A bottom sheet (modal dialog) suited to phones; centred on wide screens. */
export function openSheet(title: string, body: HTMLElement): { close(): void; dialog: HTMLDialogElement } {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.innerHTML = `
    <div class="sheet-head">
      <h2 class="sheet-title"></h2>
      <button class="btn icon" data-close aria-label="Close">${ICONS.close}</button>
    </div>
    <div class="sheet-body"></div>`;
  dialog.querySelector('.sheet-title')!.textContent = title;
  // Without a title, the close button floats in the corner instead of taking a row.
  if (!title) dialog.classList.add('untitled');
  dialog.querySelector('.sheet-body')!.append(body);
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('[data-close]')!.addEventListener('click', close);
  // Tap on the backdrop closes.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) close();
  });
  dialog.showModal();
  return { close, dialog };
}

let toastTimer = 0;

/** Brief message at the bottom of the screen. */
export function toast(message: string, kind: '' | 'error' = ''): void {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle('error', kind === 'error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}
