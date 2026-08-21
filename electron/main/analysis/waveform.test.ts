import { describe, it, expect } from 'vitest'
import { computeWaveformPeaks } from './waveform'

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
