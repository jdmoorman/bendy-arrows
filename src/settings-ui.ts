import type { Settings } from './storage';
import { setShowCoordinates } from './render';
import { applyTheme } from './themes';
import { el, openSheet } from './ui';

const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');
/** The settings last applied: with no theme picked, the theme follows the device as it changes. */
let applied: Settings | null = null;
deviceDark.addEventListener('change', () => {
  if (applied && !applied.theme) applySettings(applied);
});

/** The theme shown: the one picked, or else the device's. */
function isDark(s: Settings): boolean {
  return s.theme ? s.theme === 'dark' : deviceDark.matches;
}

/** Apply page-wide display settings. */
export function applySettings(s: Settings): void {
  applied = s;
  applyTheme(isDark(s) ? 'dark' : 'light');
  document.documentElement.classList.toggle('no-checkerboard', !s.checkerboard);
  setShowCoordinates(s.coordinates);
}

type Flag = 'checkerboard' | 'coordinates' | 'autoCheck' | 'hintMoves' | 'winAnimation';
const flag = (key: Flag, label: string) => ({
  label,
  get: (s: Settings) => s[key],
  set: (s: Settings, on: boolean): Settings => ({ ...s, [key]: on }),
});
const SWITCHES: { label: string; get: (s: Settings) => boolean; set: (s: Settings, on: boolean) => Settings }[] = [
  // Shows the device's theme until flipped; from then on, the one picked.
  { label: 'Dark theme', get: isDark, set: (s, on) => ({ ...s, theme: on ? 'dark' : 'light' }) },
  flag('checkerboard', 'Checkerboard shading'),
  flag('coordinates', 'Grid coordinates'),
  flag('autoCheck', 'Auto-check'),
  flag('hintMoves', 'Hints show the move'),
  flag('winAnimation', 'Win animation'),
];

/** The settings sheet: one switch per setting, saved as soon as it changes. */
/**
 * Two small links at the bottom: download the solve log of the puzzle being played
 * (`onExportLog`), and every puzzle's (`onExportLogs`). Each is greyed out when there's nothing
 * to download (its handler missing).
 */
export function openSettingsSheet(current: Settings, onChange: (s: Settings) => void, onExportLogs?: () => void, onExportLog?: () => void): void {
  const body = el('div', 'sheet-stack');
  for (const { label, get, set } of SWITCHES) {
    const row = el('label', 'switch-row');
    const text = el('span', 'switch-text');
    text.append(document.createTextNode(label));
    const input = el('input', 'switch') as HTMLInputElement;
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = get(current);
    input.addEventListener('change', () => {
      current = set(current, input.checked);
      onChange(current);
    });
    // Enter flips a switch too (Space does already, as for any checkbox).
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      input.click();
    });
    row.append(text, input);
    body.append(row);
  }
  const exportLink = (label: string, run?: () => void) => {
    const link = el('button', 'link-btn export-logs') as HTMLButtonElement;
    link.type = 'button';
    link.textContent = label;
    link.disabled = !run;
    if (run) link.addEventListener('click', run);
    body.append(link);
  };
  exportLink('Export this puzzle’s solve log', onExportLog);
  exportLink('Export all solve logs', onExportLogs);
  openSheet('Settings', body);
}
