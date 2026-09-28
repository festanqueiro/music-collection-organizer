// The second screen ("Show on a screen", docs/features/second-screen.md,
// ADR 0046): MCO's page opens it with window.open('', 'mco-screen-…',
// 'display=<id>|window') and renders into it. This allows exactly that
// window — on the chosen display, black, full screen — and refuses any
// other window.open.
import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Display } from 'electron'
import type { ScreenDisplay, ScreenTarget } from '../../src/types'

export const SCREEN_FRAME_PREFIX = 'mco-screen'
const WINDOW_SIZE = { width: 960, height: 540 }

export function toScreenDisplays(displays: Display[], mainWindowDisplayId: number | null): ScreenDisplay[] {
  return displays.map((d) => ({
    id: d.id,
    label: d.label || (d.internal ? 'Built-in display' : `Display ${d.id}`),
    internal: d.internal,
    width: d.bounds.width,
    height: d.bounds.height,
    hz: Math.round(d.displayFrequency || 0),
    hasMainWindow: d.id === mainWindowDisplayId,
  }))
}

// "display=12" / "display=window" in window.open's features.
export function parseScreenTarget(features: string): ScreenTarget | null {
  const match = /(?:^|,)\s*display=([^,\s]+)/.exec(features)
  if (!match) return null
  if (match[1] === 'window') return 'window'
  const id = Number(match[1])
  return Number.isInteger(id) ? id : null
}

type Bounds = { x: number; y: number; width: number; height: number }

// What to do with a window.open: null refuses it; otherwise the window's
// options, and whether to make it full screen once created. `displays`:
// id → bounds; `mainBounds`: MCO's window, which "window" opens over.
export function screenWindowPlan(
  frameName: string,
  features: string,
  displays: Map<number, Bounds>,
  mainBounds: Bounds | null
): { options: BrowserWindowConstructorOptions; fullScreen: boolean } | null {
  if (!frameName.startsWith(SCREEN_FRAME_PREFIX)) return null
  const target = parseScreenTarget(features)
  if (target === null) return null
  const base: BrowserWindowConstructorOptions = { title: 'MCO Screen', backgroundColor: '#000000', show: true }
  if (target === 'window') {
    const x = mainBounds ? Math.round(mainBounds.x + (mainBounds.width - WINDOW_SIZE.width) / 2) : undefined
    const y = mainBounds ? Math.round(mainBounds.y + (mainBounds.height - WINDOW_SIZE.height) / 2) : undefined
    return { options: { ...base, ...WINDOW_SIZE, x, y }, fullScreen: false }
  }
  const bounds = displays.get(target)
  if (!bounds) return null
  // Placed on that display first, so full screen happens there.
  return { options: { ...base, ...bounds, frame: false }, fullScreen: true }
}

let screenWindow: BrowserWindow | null = null

// Per main window: its window.open policy, and closing the screen with it.
export function attachScreenWindowPolicy(mainWindow: BrowserWindow): void {
  let pendingFullScreen = false
  mainWindow.webContents.setWindowOpenHandler(({ frameName, features }) => {
    const displays = new Map(screen.getAllDisplays().map((d) => [d.id, d.bounds]))
    const plan = screenWindowPlan(frameName, features, displays, mainWindow.getBounds())
    if (!plan) return { action: 'deny' }
    pendingFullScreen = plan.fullScreen
    return { action: 'allow', overrideBrowserWindowOptions: plan.options }
  })
  mainWindow.webContents.on('did-create-window', (child) => {
    screenWindow?.close()
    screenWindow = child
    child.setMenuBarVisibility(false)
    if (pendingFullScreen) child.setFullScreen(true)
    child.on('closed', () => {
      if (screenWindow === child) screenWindow = null
    })
  })
  mainWindow.on('closed', () => {
    screenWindow?.close()
    screenWindow = null
  })
}

export function listScreenDisplays(mainWindow: BrowserWindow | null): ScreenDisplay[] {
  const mainDisplayId = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()).id : null
  return toScreenDisplays(screen.getAllDisplays(), mainDisplayId)
}

// Pushes the display list whenever displays come, go or change (an Apple
// TV joining as an AirPlay display, a projector unplugged).
export function watchScreenDisplays(send: () => void): void {
  screen.on('display-added', send)
  screen.on('display-removed', send)
  screen.on('display-metrics-changed', send)
}
