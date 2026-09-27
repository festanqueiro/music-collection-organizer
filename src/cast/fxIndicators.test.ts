import { describe, it, expect } from 'vitest'
import { activeEffects, activeMicEffects } from './fxIndicators'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_MIC_SETTINGS, type EffectsSettings } from '../types'

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

describe('activeMicEffects', () => {
  const mic = (patch: (s: typeof DEFAULT_MIC_SETTINGS) => void) => {
    const settings = structuredClone(DEFAULT_MIC_SETTINGS)
    settings.enabled = true
    patch(settings)
    return settings
  }

  it('shows them with the mic off too, like the music effects without a track', () => {
    const settings = mic((s) => {
      s.echo.enabled = true
      s.pitch.enabled = true
    })
    settings.enabled = false
    expect(activeMicEffects(settings)).toEqual(['Mic Pitch', 'Mic Echo'])
  })

  it("shows the mic's effects that are on and audible", () => {
    expect(activeMicEffects(mic(() => {}))).toEqual([])
    expect(
      activeMicEffects(
        mic((s) => {
          s.pitch.enabled = true
          s.echo.enabled = true
          s.eq.high = 3
        })
      )
    ).toEqual(['Mic EQ', 'Mic Pitch', 'Mic Echo'])
  })

  it('leaves out a pitch shift of zero semitones', () => {
    expect(
      activeMicEffects(
        mic((s) => {
          s.pitch.enabled = true
          s.pitch.semitones = 0
        })
      )
    ).toEqual([])
  })
})
