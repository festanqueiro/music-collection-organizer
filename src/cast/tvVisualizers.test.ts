import { describe, it, expect } from 'vitest'
import { BeatDetector, ballistic, isTvVisualizer, logBands, rmsDb } from './tvVisualizers'

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

describe('rmsDb', () => {
  it('is silence for a flat line and about -3 dB for a full-scale sine', () => {
    expect(rmsDb(new Uint8Array(512).fill(128))).toBe(-Infinity)
    const sine = new Uint8Array(1024).map((_, i) => 128 + Math.round(127 * Math.sin((i / 1024) * Math.PI * 16)))
    expect(rmsDb(sine)).toBeCloseTo(-3, 0)
  })
})

describe('ballistic', () => {
  it('rises faster than it falls', () => {
    const up = ballistic(0, 1, 0.05, 0.05, 0.5)
    const down = 1 - ballistic(1, 0, 0.05, 0.05, 0.5)
    expect(up).toBeGreaterThan(down)
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
    expect(isTvVisualizer('tv-vu')).toBe(true)
    expect(isTvVisualizer('nebula')).toBe(false)
  })
})
