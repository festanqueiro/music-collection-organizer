import { describe, it, expect } from 'vitest'
import { TAG_COLORS, nextTagColor } from './tagColors'

describe('nextTagColor', () => {
  it('goes round the palette in order for a fresh collection', () => {
    expect(nextTagColor([])).toBe(TAG_COLORS[0])
    expect(nextTagColor([TAG_COLORS[0], null])).toBe(TAG_COLORS[1])
  })

  it('fills the gap a deleted or recoloured tag left', () => {
    expect(nextTagColor(TAG_COLORS.filter((_, i) => i !== 4))).toBe(TAG_COLORS[4])
  })

  it('starts a second round once every colour is used, ignoring custom colours and case', () => {
    expect(nextTagColor([...TAG_COLORS.map((c) => c.toUpperCase()), '#123456', TAG_COLORS[0]])).toBe(TAG_COLORS[1])
  })
})
