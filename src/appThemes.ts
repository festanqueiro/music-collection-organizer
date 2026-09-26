// The app's colour themes (Settings → Appearance). The palettes themselves
// are in src/themes.css, keyed by <html data-theme="…">; this is the list
// the picker shows and main uses (the window's background colour, so
// there's no flash of the wrong colour before first paint).
export type AppThemeId = 'mco-dark' | 'midnight' | 'carbon' | 'mco-light' | 'paper' | 'arctic'

export interface AppTheme {
  id: AppThemeId
  name: string
  dark: boolean
  // --color-bg, for the native window behind the page.
  background: string
}

export const APP_THEMES: AppTheme[] = [
  { id: 'mco-dark', name: 'MCO Dark', dark: true, background: '#12151a' },
  { id: 'midnight', name: 'Midnight', dark: true, background: '#0e1220' },
  { id: 'carbon', name: 'Carbon', dark: true, background: '#0c0c0c' },
  { id: 'mco-light', name: 'MCO Light', dark: false, background: '#f4f6f8' },
  { id: 'paper', name: 'Paper', dark: false, background: '#f6f1e7' },
  { id: 'arctic', name: 'Arctic', dark: false, background: '#eef3f9' },
]

export const DEFAULT_APP_THEME: AppThemeId = 'mco-dark'

// How main hands the saved theme to the preload script (a command-line
// switch on the renderer process, readable synchronously at startup).
export const APP_THEME_ARG = '--mco-app-theme='

export function isAppThemeId(value: unknown): value is AppThemeId {
  return APP_THEMES.some((theme) => theme.id === value)
}

export function getAppTheme(id: AppThemeId): AppTheme {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0]
}
