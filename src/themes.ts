/**
 * Colour themes. Every colour in the app comes from one of these CSS custom
 * properties; adding a theme means adding one entry to `THEMES`. Light is the
 * default; dark is chosen in Settings.
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
  | 'path-solved'
  | 'path-edge'
  | 'path-solved-edge'
  | 'error-edge'
  | 'hint'
  | 'hint-edge'
  | 'hint-fill'
  | 'xmark'
  | 'end'
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
    'tile-alt': '#191e2a',
    // Walls and blocked tiles are light, to stand out on dark tiles (the inverse of
    // the light theme's black); they share a colour so blocks read as solid shapes.
    'tile-blocked': '#c9cfdb',
    'grid-line': '#2f3749',
    wall: '#c9cfdb',
    path: '#5eb8ff',
    'path-solved': '#5ee0a0',
    'path-edge': '#2f86d6',
    'path-solved-edge': '#2fb174',
    'error-edge': '#c23a55',
    hint: '#ffcf70',
    'hint-edge': '#d99a1c',
    'hint-fill': 'rgba(255, 207, 112, 0.42)',
    xmark: '#ff8a65',
    end: '#e6e9f0',
    error: '#ff5c7a',
    'error-fill': 'rgba(255, 92, 122, 0.18)',
    success: '#5ee0a0',
    ghost: 'rgba(94, 224, 160, 0.45)',
    hover: 'rgba(94, 184, 255, 0.18)',
  },
  light: {
    bg: '#f2f3f5',
    surface: '#ffffff',
    'surface-2': '#e8eaee',
    border: '#d0d4dc',
    text: '#15181e',
    'text-muted': '#5b6271',
    accent: '#2563eb',
    'accent-text': '#ffffff',
    tile: '#ffffff',
    'tile-alt': '#f1f3f6',
    'tile-blocked': '#000000',
    'grid-line': '#c4c9d2',
    wall: '#000000',
    path: '#7aa7f2',
    'path-solved': '#7fcf9e',
    'path-edge': '#4a78c9',
    'path-solved-edge': '#4a9e6c',
    'error-edge': '#9e1f3a',
    hint: '#ffd27a',
    'hint-edge': '#c98a00',
    'hint-fill': '#ffdf8f',
    xmark: '#000000',
    end: '#000000',
    error: '#d92d4b',
    'error-fill': 'rgba(217, 45, 75, 0.14)',
    success: '#139a5b',
    ghost: 'rgba(19, 154, 91, 0.38)',
    hover: 'rgba(37, 99, 235, 0.1)',
  },
} satisfies Record<string, ThemeTokens>;

export type ThemeName = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeName = 'light';

export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement): void {
  const tokens: ThemeTokens = THEMES[name] ?? THEMES[DEFAULT_THEME];
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  root.dataset.theme = name;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', tokens.bg);
  root.style.colorScheme = name === 'light' ? 'light' : 'dark';
}
