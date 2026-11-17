/**
 * Colour themes. Every colour in the app comes from one of these CSS custom
 * properties; adding a theme means adding one entry to `THEMES`.
 */

export type ThemeTokens = Record<
  | 'bg'
  | 'surface'
  | 'surface-2'
  | 'border'
  | 'text'
  | 'text-muted'
  | 'accent'
  | 'accent-text'
  | 'tile'
  | 'tile-alt'
  | 'tile-blocked'
  | 'grid-line'
  | 'wall'
  | 'path'
  | 'given'
  | 'xmark'
  | 'endpoint'
  | 'error'
  | 'error-fill'
  | 'success'
  | 'ghost'
  | 'hover',
  string
>;

export const THEMES = {
  dark: {
    bg: '#0f1218',
    surface: '#181c25',
    'surface-2': '#222836',
    border: '#2e3546',
    text: '#e6e9f0',
    'text-muted': '#8c94a8',
    accent: '#5eb8ff',
    'accent-text': '#08121c',
    tile: '#1d2230',
    'tile-alt': '#1d2230',
    'tile-blocked': '#05070a',
    'grid-line': '#2f3749',
    wall: '#000000',
    path: '#5eb8ff',
    given: '#c9a6ff',
    xmark: '#ff8a65',
    endpoint: '#ffd166',
    error: '#ff5c7a',
    'error-fill': 'rgba(255, 92, 122, 0.18)',
    success: '#5ee0a0',
    ghost: 'rgba(94, 224, 160, 0.45)',
    hover: 'rgba(94, 184, 255, 0.18)',
  },
  light: {
    bg: '#f4f5f8',
    surface: '#ffffff',
    'surface-2': '#eceef3',
    border: '#d3d7e0',
    text: '#1a1e27',
    'text-muted': '#5d6578',
    accent: '#1f6fd1',
    'accent-text': '#ffffff',
    tile: '#ffffff',
    'tile-alt': '#ffffff',
    'tile-blocked': '#1a1e27',
    'grid-line': '#c9ced9',
    wall: '#1a1e27',
    path: '#1f6fd1',
    given: '#7c3aed',
    xmark: '#d9480f',
    endpoint: '#c98a00',
    error: '#d6264b',
    'error-fill': 'rgba(214, 38, 75, 0.14)',
    success: '#16955d',
    ghost: 'rgba(22, 149, 93, 0.4)',
    hover: 'rgba(31, 111, 209, 0.12)',
  },
} satisfies Record<string, ThemeTokens>;

export type ThemeName = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeName = 'dark';

export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement): void {
  const tokens: ThemeTokens = THEMES[name] ?? THEMES[DEFAULT_THEME];
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  root.dataset.theme = name;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', tokens.bg);
  root.style.colorScheme = name === 'light' ? 'light' : 'dark';
}
