import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_THEMES, getAppTheme, isAppThemeId } from './appThemes'

const css = readFileSync(join(__dirname, 'themes.css'), 'utf8')

// Each theme's block in themes.css, as { --color-x: value }.
function palette(id: string): Record<string, string> {
  const match = new RegExp(`\\[data-theme='${id}'\\] \\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`no palette for ${id} in themes.css`)
  return Object.fromEntries([...match[1].matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

describe('app themes', () => {
  it('has three dark and three light themes', () => {
    expect(APP_THEMES.filter((t) => t.dark)).toHaveLength(3)
    expect(APP_THEMES.filter((t) => !t.dark)).toHaveLength(3)
  })

  it('defines every colour for every theme in themes.css', () => {
    const tokens = Object.keys(palette('mco-dark')).sort()
    for (const theme of APP_THEMES) expect(Object.keys(palette(theme.id)).sort()).toEqual(tokens)
  })

  it("uses each theme's own background for the window", () => {
    for (const theme of APP_THEMES) expect(palette(theme.id)['--color-bg']).toBe(theme.background)
  })

  it('falls back to the default for an unknown id', () => {
    expect(isAppThemeId('paper')).toBe(true)
    expect(isAppThemeId('neon')).toBe(false)
    expect(getAppTheme('nope' as never).id).toBe('mco-dark')
  })
})
