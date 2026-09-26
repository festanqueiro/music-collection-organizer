import { describe, it, expect } from 'vitest'
import { stageQ, resonanceCompensation } from './effectsChain'

describe('stageQ', () => {
  it('stays flat while the stage is open, whatever the resonance', () => {
    expect(stageQ(0, 10)).toBeCloseTo(Math.SQRT1_2)
  })

  it('reaches the dialed-in resonance a quarter of the way in', () => {
    expect(stageQ(0.25, 10)).toBeCloseTo(10)
    expect(stageQ(1, 10)).toBeCloseTo(10)
  })

  it('fades in between', () => {
    const halfway = stageQ(0.125, 10)
    expect(halfway).toBeGreaterThan(Math.SQRT1_2)
    expect(halfway).toBeLessThan(10)
  })
})

describe('resonanceCompensation', () => {
  it('leaves flat stages at unity', () => {
    expect(resonanceCompensation(Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(1)
  })

  it('turns the filtered signal down as resonance rises', () => {
    expect(resonanceCompensation(10, Math.SQRT1_2)).toBeLessThan(0.5)
  })
})
