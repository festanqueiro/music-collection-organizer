import { describe, it, expect } from 'vitest'
import { keepOnScreen } from './ContextMenu'

describe('keepOnScreen', () => {
  it('leaves a menu that fits where it was opened', () => {
    expect(keepOnScreen(100, 200, 220, 300, 1600, 1000)).toEqual({ left: 100, top: 200 })
  })

  it('moves a menu opened on the last row up, so the player never covers it', () => {
    expect(keepOnScreen(400, 860, 220, 420, 1600, 1000)).toEqual({ left: 400, top: 572 })
  })

  it('moves a menu at the right edge back in', () => {
    expect(keepOnScreen(1550, 100, 220, 300, 1600, 1000)).toEqual({ left: 1372, top: 100 })
  })

  it('starts at the top margin when the menu is taller than the window', () => {
    expect(keepOnScreen(100, 500, 220, 1200, 1600, 1000)).toEqual({ left: 100, top: 8 })
  })
})
