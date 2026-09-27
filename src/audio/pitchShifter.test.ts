import { describe, expect, it } from 'vitest'
import { PitchShifter, semitonesToRatio } from './pitchShifter'

const RATE = 48000

function sine(hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(RATE * seconds))
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / RATE)
  return out
}

// Runs a signal through in 128-sample blocks, like an AudioWorklet.
function run(shifter: PitchShifter, input: Float32Array): Float32Array {
  const output = new Float32Array(input.length)
  for (let i = 0; i < input.length; i += 128) shifter.process(input.subarray(i, i + 128), output.subarray(i, i + 128))
  return output
}

// Zero crossings per second / 2 ≈ frequency, over the last half second.
function frequency(signal: Float32Array): number {
  const tail = signal.subarray(signal.length - RATE / 2)
  let crossings = 0
  for (let i = 1; i < tail.length; i++) if (tail[i - 1] < 0 !== tail[i] < 0) crossings++
  return crossings
}

describe('PitchShifter', () => {
  it('maps semitones to a frequency ratio', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2)
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5)
    expect(semitonesToRatio(0)).toBe(1)
  })

  it('passes the voice through untouched at mix 0', () => {
    const shifter = new PitchShifter(RATE)
    shifter.set(7, 0)
    const input = sine(440, 0.1)
    expect(Array.from(run(shifter, input))).toEqual(Array.from(input))
  })

  it('shifts an octave up and down', () => {
    for (const [semitones, expected] of [
      [12, 880],
      [-12, 220],
      [7, 440 * semitonesToRatio(7)],
    ]) {
      const shifter = new PitchShifter(RATE)
      shifter.set(semitones, 1)
      const out = run(shifter, sine(440, 3))
      expect(Math.abs(frequency(out) - expected) / expected).toBeLessThan(0.04)
    }
  })

  it('keeps the level steady (the two heads sum to full)', () => {
    const shifter = new PitchShifter(RATE)
    shifter.set(-5, 1)
    const out = run(shifter, sine(300, 3)).subarray(RATE * 2)
    let peak = 0
    for (const v of out) peak = Math.max(peak, Math.abs(v))
    expect(peak).toBeGreaterThan(0.7)
    expect(peak).toBeLessThan(1.3)
  })
})
