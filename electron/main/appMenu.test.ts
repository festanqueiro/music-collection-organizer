import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildAppMenuTemplate, type AppMenuOptions } from './appMenu'

const options = (over: Partial<AppMenuOptions> = {}): AppMenuOptions => ({
  isMac: true,
  isDev: false,
  appName: 'MCO',
  send: vi.fn(),
  openUrl: vi.fn(),
  showCollectionFolder: vi.fn(),
  ...over,
})
const items = (menu: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
  menu.flatMap((m) => (Array.isArray(m.submenu) ? [m, ...items(m.submenu)] : [m]))
const labels = (menu: MenuItemConstructorOptions[]) => menu.map((m) => m.label ?? m.role)

describe('buildAppMenuTemplate', () => {
  it('has the app menu first on macOS only', () => {
    expect(labels(buildAppMenuTemplate(options()))).toEqual(['MCO', 'File', 'Edit', 'Playback', 'View', 'windowMenu', 'help'])
    const windows = buildAppMenuTemplate(options({ isMac: false }))
    expect(labels(windows)).toEqual(['File', 'Edit', 'Playback', 'View', 'windowMenu', 'help'])
    // Settings and updates move to File and Help there.
    expect(items(windows).filter((i) => i.label === 'Settings…')).toHaveLength(1)
    expect(items(windows).filter((i) => i.label === 'Check for Updates…')).toHaveLength(1)
  })

  it('sends each action to the page as its command', () => {
    const send = vi.fn()
    const all = items(buildAppMenuTemplate(options({ send })))
    const click = (label: string) => (all.find((i) => i.label === label)!.click as () => void)()
    click('Settings…')
    click('Update Collection…')
    click('Queue')
    click('Import from Rekordbox (xml)…')
    click('Export Collection to Rekordbox (xml)…')
    expect(send.mock.calls.map((c) => c[0])).toEqual(['settings', 'update-collection', 'show-queue', 'import-rekordbox', 'export-rekordbox'])
  })

  it('gives no two items the same shortcut, and none a bare key', () => {
    const accelerators = items(buildAppMenuTemplate(options({ isDev: true })))
      .map((i) => i.accelerator)
      .filter((a): a is string => !!a)
    expect(new Set(accelerators).size).toBe(accelerators.length)
    for (const a of accelerators) expect(a).toMatch(/^CmdOrCtrl\+/)
  })

  it('keeps Reload and the developer tools out of an installed app', () => {
    const roles = (isDev: boolean) => items(buildAppMenuTemplate(options({ isDev }))).map((i) => i.role)
    expect(roles(false)).not.toContain('reload')
    expect(roles(false)).not.toContain('toggleDevTools')
    expect(roles(true)).toContain('toggleDevTools')
  })
})
