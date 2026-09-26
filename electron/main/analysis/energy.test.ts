import { describe, it, expect } from 'vitest'
import { energyRating } from './energy'

describe('energyRating', () => {
  it('rates quiet, sparse tracks low and loud, busy ones high', () => {
    expect(energyRating(-30, 0)).toBe(1)
    expect(energyRating(-5, 8)).toBe(10)
  })

  it('weighs loudness a little more than busyness', () => {
    expect(energyRating(-6, 0)).toBeGreaterThan(energyRating(-20, 6))
  })
})
