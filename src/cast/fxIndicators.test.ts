import { describe, it, expect } from 'vitest'
import { activeEffects } from './fxIndicators'
import { DEFAULT_EFFECTS_SETTINGS, type EffectsSettings } from '../types'

function withFx(patch: (s: EffectsSettings) => void): EffectsSettings {
  const settings = structuredClone(DEFAULT_EFFECTS_SETTINGS)
  patch(settings)
  return settings
}

describe('activeEffects', () => {
  it('shows nothing with the default settings', () => {
    expect(activeEffects(DEFAULT_EFFECTS_SETTINGS, false)).toEqual([])
  })

  it('shows effects that are on and audible', () => {
    const settings = withFx((s) => {
      s.delay.enabled = true
      s.filter.enabled = true
      s.filter.lowpass = 0.5
    })
    // The EQ is flat, so it's left out.
    expect(activeEffects(settings, false)).toEqual(['Filter', 'Delay'])
  })

  it('shows the siren while it is held or running on the beat', () => {
    const settings = withFx((s) => {
      s.siren.enabled = true
      s.siren.beat = 'off'
    })
    expect(activeEffects(settings, false)).toEqual([])
    expect(activeEffects(settings, true)).toEqual(['Siren'])
  })
})
