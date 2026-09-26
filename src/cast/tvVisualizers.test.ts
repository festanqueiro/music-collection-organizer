import { describe, it, expect } from 'vitest'
import { BeatDetector, isTvVisualizer, logBands } from './tvVisualizers'

describe('logBands', () => {
  it('puts a tone in the band that covers its frequency', () => {
    const freq = new Uint8Array(1024) // 44.1 kHz → ~21.5 Hz per bin
    freq[Math.round(1000 / (22050 / 1024))] = 255 // 1 kHz
    const bands = logBands(freq, 44100, 10)
    const loudest = bands.indexOf(Math.max(...bands))
    // 40 Hz → 16 kHz in 10 log steps: 1 kHz falls in the 6th band.
    expect(loudest).toBe(5)
    expect(bands[loudest]).toBe(1)
  })
})

describe('BeatDetector', () => {
  // 10 s at 30 fps of 2 kicks a second; the bass rises over a few frames,
  // as the analyser smooths it.
  const count = (low: number, high: number) => {
    const detector = new BeatDetector()
    let beats = 0
    for (let f = 0; f < 300; f++) {
      const phase = (f / 30) % 0.5
      const bass = phase < 0.1 ? low + (high - low) * Math.min(1, phase / 0.066) : low
      if (detector.update(bass, 1 / 30)) beats++
    }
    return beats
  }

  it('fires once per kick', () => {
    expect(count(0.2, 0.9)).toBe(20)
  })

  it('still hears kicks when the bass never drops much between them', () => {
    expect(count(0.6, 0.85)).toBe(20)
  })

  it('stays quiet on steady bass', () => {
    const detector = new BeatDetector()
    let beats = 0
    for (let f = 0; f < 300; f++) if (detector.update(0.7, 1 / 30)) beats++
    expect(beats).toBeLessThanOrEqual(1)
  })
})

describe('isTvVisualizer', () => {
  it('knows its own ids only', () => {
    expect(isTvVisualizer('tv-ripples')).toBe(true)
    expect(isTvVisualizer('tv-vu')).toBe(false)
    expect(isTvVisualizer('nebula')).toBe(false)
  })
})
