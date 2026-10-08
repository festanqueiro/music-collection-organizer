import type { WaveformBands } from '../../../src/types'

export function computeWaveformPeaks(pcm: Float32Array, peakCount = 800): number[] {
  const peaks: number[] = []
  const samplesPerPeak = Math.max(1, Math.floor(pcm.length / peakCount))
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, pcm.length)
    let max = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(pcm[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }
  return peaks
}

// The same waveform split into bass, mids and highs, for the coloured
// waveform styles (docs/features/player.md, ADR 0065): each slice's peak in
// three bands, on the same scale as computeWaveformPeaks. The bands are cut
// at 200 Hz and 4 kHz — about where a DJ mixer's EQ divides a track — with
// two one-pole filters in a row each (12 dB an octave), which is cheap and
// separates a kick from a hat well enough to colour them apart.
export type { WaveformBands }

const LOW_CUT_HZ = 200
const HIGH_CUT_HZ = 4000

export function computeWaveformBands(pcm: Float32Array, sampleRate = 44100, peakCount = 800): WaveformBands {
  const low = new Array<number>(peakCount).fill(0)
  const mid = new Array<number>(peakCount).fill(0)
  const high = new Array<number>(peakCount).fill(0)
  const samplesPerPeak = Math.max(1, Math.floor(pcm.length / peakCount))
  const a1 = 1 - Math.exp((-2 * Math.PI * LOW_CUT_HZ) / sampleRate)
  const a2 = 1 - Math.exp((-2 * Math.PI * HIGH_CUT_HZ) / sampleRate)
  // Two stages each: below 200 Hz, and below 4 kHz.
  let l1 = 0
  let l2 = 0
  let m1 = 0
  let m2 = 0
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, pcm.length)
    let maxLow = 0
    let maxMid = 0
    let maxHigh = 0
    for (let j = start; j < end; j++) {
      const x = pcm[j]
      l1 += a1 * (x - l1)
      l2 += a1 * (l1 - l2)
      m1 += a2 * (x - m1)
      m2 += a2 * (m1 - m2)
      const lowAbs = Math.abs(l2)
      const midAbs = Math.abs(m2 - l2)
      const highAbs = Math.abs(x - m2)
      if (lowAbs > maxLow) maxLow = lowAbs
      if (midAbs > maxMid) maxMid = midAbs
      if (highAbs > maxHigh) maxHigh = highAbs
    }
    // Three decimals: what a few pixels of height can show, and a third of the JSON.
    low[i] = Math.round(maxLow * 1000) / 1000
    mid[i] = Math.round(maxMid * 1000) / 1000
    high[i] = Math.round(maxHigh * 1000) / 1000
  }
  return { low, mid, high }
}
