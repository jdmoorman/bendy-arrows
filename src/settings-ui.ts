import type { Settings } from './storage';
import { el, openSheet } from './ui';

/** Apply page-wide display settings. (The timer is applied by the play view.) */
export function applySettings(s: Settings): void {
  document.documentElement.classList.toggle('no-checkerboard', !s.checkerboard);
}

const SWITCHES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'checkerboard', label: 'Checkerboard shading', hint: 'Faintly shade every other tile' },
  { key: 'showTimer', label: 'Show timer', hint: 'Show your solve time while playing' },
  { key: 'autoCheck', label: 'Auto-check', hint: 'Highlight mistakes like branches, early loops and numbers out of order as you play' },
];

/** The settings sheet: one switch per setting, saved as soon as it changes. */
export function openSettingsSheet(current: Settings, onChange: (s: Settings) => void): void {
  const body = el('div', 'sheet-stack');
  for (const { key, label, hint } of SWITCHES) {
    const row = el('label', 'switch-row');
    const text = el('span', 'switch-text');
    text.append(document.createTextNode(label), Object.assign(el('small'), { textContent: hint }));
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
