import { describe, it, expect } from 'vitest'
import { medianLoudness, gainToMatch, formatGain, formatLufs } from './loudness'

describe('loudness', () => {
  it('takes the median of the analysed tracks', () => {
    expect(medianLoudness([-9, null, -12, -6])).toBe(-9)
    expect(medianLoudness([-9, -10])).toBe(-9.5)
    expect(medianLoudness([null, null])).toBeNull()
    expect(medianLoudness([])).toBeNull()
  })

  it('gives the gain to reach the target, up for quieter tracks and down for louder', () => {
    expect(gainToMatch(-11.5, -9)).toBe(2.5)
    expect(gainToMatch(-7.2, -9)).toBe(-1.8)
    expect(gainToMatch(-9, -9)).toBe(0)
    expect(gainToMatch(null, -9)).toBeNull()
    expect(gainToMatch(-9, null)).toBeNull()
  })

  it('formats with a sign and one decimal', () => {
    expect(formatGain(2.5)).toBe('+2.5 dB')
    expect(formatGain(-1.8)).toBe('−1.8 dB')
    expect(formatGain(0)).toBe('±0.0 dB')
    expect(formatLufs(-8.4)).toBe('−8.4')
  })
})
