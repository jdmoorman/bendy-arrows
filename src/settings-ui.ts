import type { Settings } from './storage';
import { setShowCoordinates } from './render';
import { applyTheme } from './themes';
import { el, openSheet } from './ui';

/** Apply page-wide display settings. */
export function applySettings(s: Settings): void {
  applyTheme(s.darkTheme ? 'dark' : 'light');
  document.documentElement.classList.toggle('no-checkerboard', !s.checkerboard);
  setShowCoordinates(s.coordinates);
}

const SWITCHES: { key: keyof Settings; label: string }[] = [
  { key: 'darkTheme', label: 'Dark theme' },
  { key: 'checkerboard', label: 'Checkerboard shading' },
  { key: 'coordinates', label: 'Grid coordinates' },
  { key: 'autoCheck', label: 'Auto-check' },
  { key: 'oneStroke', label: 'One-shot mode' },
];

/** The settings sheet: one switch per setting, saved as soon as it changes. */
export function openSettingsSheet(current: Settings, onChange: (s: Settings) => void): void {
  const body = el('div', 'sheet-stack');
  for (const { key, label } of SWITCHES) {
    const row = el('label', 'switch-row');
    const text = el('span', 'switch-text');
    text.append(document.createTextNode(label));
    const input = el('input', 'switch') as HTMLInputElement;
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = current[key];
    input.addEventListener('change', () => {
      current = { ...current, [key]: input.checked };
      onChange(current);
    });
    row.append(text, input);
    body.append(row);
  }
  openSheet('Settings', body);
}
