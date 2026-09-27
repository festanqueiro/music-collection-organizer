import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, screen: {} }))

import { parseScreenTarget, screenWindowPlan, toScreenDisplays } from './screenWindow'

const displays = new Map([
  [1, { x: 0, y: 0, width: 1512, height: 982 }],
  [7, { x: 1512, y: 0, width: 1920, height: 1080 }],
])
const main = { x: 100, y: 100, width: 1200, height: 800 }

describe('parseScreenTarget', () => {
  it('reads a display id or "window"', () => {
    expect(parseScreenTarget('display=7')).toBe(7)
    expect(parseScreenTarget('width=10,display=window')).toBe('window')
    expect(parseScreenTarget('display=abc')).toBeNull()
    expect(parseScreenTarget('')).toBeNull()
  })
})

describe('screenWindowPlan', () => {
  it("refuses anything that isn't the screen window", () => {
    expect(screenWindowPlan('', 'display=7', displays, main)).toBeNull()
    expect(screenWindowPlan('other', 'display=7', displays, main)).toBeNull()
    expect(screenWindowPlan('mco-screen-1', '', displays, main)).toBeNull()
  })

  it('refuses a display that is gone', () => {
    expect(screenWindowPlan('mco-screen-1', 'display=99', displays, main)).toBeNull()
  })

  it("puts the screen on the chosen display's bounds, frameless and then full screen", () => {
    const plan = screenWindowPlan('mco-screen-1', 'display=7', displays, main)
    expect(plan?.fullScreen).toBe(true)
    expect(plan?.options).toMatchObject({ x: 1512, y: 0, width: 1920, height: 1080, frame: false, backgroundColor: '#000000' })
  })

  it('opens "window" as a normal window centred on MCO', () => {
    const plan = screenWindowPlan('mco-screen-2', 'display=window', displays, main)
    expect(plan?.fullScreen).toBe(false)
    expect(plan?.options).toMatchObject({ width: 960, height: 540, x: 220, y: 230 })
    expect(plan?.options.frame).toBeUndefined()
  })
})

describe('toScreenDisplays', () => {
  it('names displays and marks the one MCO is on', () => {
    const list = toScreenDisplays(
      [
        { id: 1, label: 'Built-in Retina Display', internal: true, bounds: displays.get(1)!, displayFrequency: 120.0006 },
        { id: 7, label: '', internal: false, bounds: displays.get(7)!, displayFrequency: 60 },
      ] as never,
      1
    )
    expect(list).toEqual([
      { id: 1, label: 'Built-in Retina Display', internal: true, width: 1512, height: 982, hz: 120, hasMainWindow: true },
      { id: 7, label: 'Display 7', internal: false, width: 1920, height: 1080, hz: 60, hasMainWindow: false },
    ])
  })
})
