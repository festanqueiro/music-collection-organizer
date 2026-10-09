import { describe, it, expect } from 'vitest'
import { computeWaveformBands, computeWaveformPeaks, decodeWaveformBands, encodeWaveformBands } from './waveform'

describe('computeWaveformPeaks', () => {
  it('returns the requested number of peaks', () => {
    const pcm = new Float32Array(1000).fill(0.5)
    const peaks = computeWaveformPeaks(pcm, 10)
    expect(peaks).toHaveLength(10)
  })

  it('captures the max absolute amplitude per bucket', () => {
    const pcm = new Float32Array([0.1, -0.9, 0.2, 0.3, -0.1, 0.05])
    const peaks = computeWaveformPeaks(pcm, 2)
    expect(peaks[0]).toBeCloseTo(0.9)
    expect(peaks[1]).toBeCloseTo(0.3)
  })
})

describe('computeWaveformBands', () => {
  const SR = 44100
  const tone = (hz: number, seconds = 1, level = 0.8) => Float32Array.from({ length: Math.floor(SR * seconds) }, (_, i) => level * Math.sin((2 * Math.PI * hz * i) / SR))
  const loudest = (bands: { low: number[]; mid: number[]; high: number[] }) => {
    // The last slice: the filters have settled by then.
    const at = bands.low.length - 1
    const levels = { low: bands.low[at], mid: bands.mid[at], high: bands.high[at] }
    return (Object.keys(levels) as (keyof typeof levels)[]).sort((a, b) => levels[b] - levels[a])[0]
  }

  it('returns the requested number of slices for each band', () => {
    const bands = computeWaveformBands(tone(440), SR, 50)
    expect([bands.low.length, bands.mid.length, bands.high.length]).toEqual([50, 50, 50])
  })

  it('puts a bass note in the lows, a lead in the mids and a hat in the highs', () => {
    expect(loudest(computeWaveformBands(tone(60), SR, 20))).toBe('low')
    expect(loudest(computeWaveformBands(tone(1000), SR, 20))).toBe('mid')
    expect(loudest(computeWaveformBands(tone(10000), SR, 20))).toBe('high')
  })

  it('stays on the scale of the plain waveform, and is silent for silence', () => {
    const bands = computeWaveformBands(tone(60), SR, 20)
    expect(bands.low[19]).toBeGreaterThan(0.6)
    expect(bands.low[19]).toBeLessThanOrEqual(0.81)
    const silent = computeWaveformBands(new Float32Array(SR), SR, 10)
    expect([...silent.low, ...silent.mid, ...silent.high].every((v) => v === 0)).toBe(true)
  })

  it('works at the lower rate used for tracks analysed before', () => {
    const half = Float32Array.from({ length: 22050 }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 60 * i) / 22050))
    expect(loudest(computeWaveformBands(half, 22050, 20))).toBe('low')
  })
})

describe('the bands as stored', () => {
  const bands = { low: [0, 0.5, 1, 0.715], mid: [0.25, 1.023, 0, 0.1], high: [0.283, 0, 0.004, 1] }

  it('come back as they went in, to a 255th, in under half the text', () => {
    const stored = encodeWaveformBands(bands)
    const back = decodeWaveformBands(stored)!
    for (const key of ['low', 'mid', 'high'] as const) {
      expect(back[key]).toHaveLength(4)
      back[key].forEach((v, i) => expect(Math.abs(v - Math.min(1, bands[key][i]))).toBeLessThan(0.003))
    }
    const real = { low: Array(800).fill(0.715), mid: Array(800).fill(0.283), high: Array(800).fill(0.041) }
    expect(encodeWaveformBands(real).length).toBeLessThan(JSON.stringify(real).length / 2)
  })

  it('still reads the JSON that rows written before hold, and nothing from rubbish', () => {
    expect(decodeWaveformBands(JSON.stringify(bands))).toEqual(bands)
    expect(decodeWaveformBands('not json')).toBeNull()
    expect(decodeWaveformBands('b64:')).toBeNull()
  })
})

