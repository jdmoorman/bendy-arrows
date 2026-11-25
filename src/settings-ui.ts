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
  { key: 'hintMoves', label: 'Hints show the move' },
];

/** The settings sheet: one switch per setting, saved as soon as it changes. */
/**
 * Two small links at the bottom: download the solve log of the puzzle being played
 * (`onExportLog`), and every puzzle's (`onExportLogs`). Each is greyed out when there's nothing
 * to download (its handler missing).
 */
export function openSettingsSheet(current: Settings, onChange: (s: Settings) => void, onExportLogs?: () => void, onExportLog?: () => void): void {
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
