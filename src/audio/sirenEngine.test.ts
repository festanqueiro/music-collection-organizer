import { describe, expect, it } from 'vitest'
import { sirenLevelToGain } from './sirenEngine'

describe('sirenLevelToGain', () => {
  it('follows a squared taper so the knob midpoint is well below half gain', () => {
    expect(sirenLevelToGain(0)).toBe(0)
    expect(sirenLevelToGain(0.5)).toBeCloseTo(0.25)
    expect(sirenLevelToGain(1)).toBe(1)
  })

  it('clamps out-of-range levels', () => {
    expect(sirenLevelToGain(-0.2)).toBe(0)
    expect(sirenLevelToGain(1.5)).toBe(1)
  })
})
