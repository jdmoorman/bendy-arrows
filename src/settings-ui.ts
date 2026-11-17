import type { Settings } from './storage';
import { el, openSheet } from './ui';

/** Apply display settings to the page. */
export function applySettings(s: Settings): void {
  document.documentElement.classList.toggle('no-checkerboard', !s.checkerboard);
}

/** The settings sheet: one switch per setting, saved as soon as it changes. */
export function openSettingsSheet(current: Settings, onChange: (s: Settings) => void): void {
  const body = el('div', 'sheet-stack');
  const row = el('label', 'switch-row');
  const text = el('span', 'switch-text', 'Checkerboard shading<small>Faintly shade every other tile</small>');
  const input = el('input', 'switch') as HTMLInputElement;
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = current.checkerboard;
  input.addEventListener('change', () => {
    current = { ...current, checkerboard: input.checked };
    onChange(current);
  });
  row.append(text, input);
  body.append(row);
  openSheet('Settings', body);
}
