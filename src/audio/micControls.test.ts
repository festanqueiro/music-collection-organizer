import { describe, expect, it } from 'vitest'
import { DEFAULT_MIC_SETTINGS } from '../types'
import { MIC_KNOBS, MIC_TOGGLES, echoTimeForDivision, talkAfterRelease } from './micControls'
import { compressorParams } from './mic'

describe('talkAfterRelease', () => {
  it('a tap toggles', () => {
    expect(talkAfterRelease(true, 100)).toBe(false)
    expect(talkAfterRelease(false, 100)).toBe(true)
  })

  it('holding a muted mic talks only while held', () => {
    expect(talkAfterRelease(false, 1200)).toBe(false)
  })

  it('holding a live mic leaves it live', () => {
    expect(talkAfterRelease(true, 1200)).toBe(true)
  })
})

describe('mic MIDI controls', () => {
  it('toggles flip their own setting only', () => {
    const toggle = MIC_TOGGLES['mic.echo.enabled']!
    const next = toggle.set(DEFAULT_MIC_SETTINGS, !toggle.get(DEFAULT_MIC_SETTINGS))
    expect(next.echo.enabled).toBe(true)
    expect(next.echo.timeMs).toBe(DEFAULT_MIC_SETTINGS.echo.timeMs)
    expect(next.reverb).toEqual(DEFAULT_MIC_SETTINGS.reverb)
  })

  it('knobs set their own value', () => {
    expect(MIC_KNOBS['mic.eq.mid']!(DEFAULT_MIC_SETTINGS, 4).eq).toEqual({ low: 0, mid: 4, high: 0 })
    expect(MIC_KNOBS['mic.duck.amountDb']!(DEFAULT_MIC_SETTINGS, 18).duck.amountDb).toBe(18)
  })
})

describe('echoTimeForDivision', () => {
  it('is a quarter note at the BPM, clamped to the knob', () => {
    expect(echoTimeForDivision(120, 1)).toBe(500)
    expect(echoTimeForDivision(120, 0.5)).toBe(250)
    expect(echoTimeForDivision(40, 4)).toBe(1000)
  })
})

describe('compressorParams', () => {
  it('is off at 0', () => {
    expect(compressorParams(0)).toEqual({ thresholdDb: -10, ratio: 1, makeupDb: 0 })
  })

  it('squashes harder with more make-up as it rises, capped at 12 dB', () => {
    const half = compressorParams(0.5)
    const full = compressorParams(1)
    expect(full.thresholdDb).toBeLessThan(half.thresholdDb)
    expect(full.ratio).toBe(12)
    expect(full.makeupDb).toBeLessThanOrEqual(12)
    expect(half.makeupDb).toBeGreaterThan(0)
  })
})
