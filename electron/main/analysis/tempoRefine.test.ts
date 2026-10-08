import { describe, it, expect } from 'vitest'
import { onsetEnvelope, refineBpm } from './tempoRefine'

const SR = 44100

// A kick on every beat and a quieter hat on every half beat, as short
// decaying bursts, at an exact tempo.
function clickTrack(bpm: number, seconds: number, startAt = 0): Float32Array {
  const pcm = new Float32Array(Math.floor(seconds * SR))
  const beat = 60 / bpm
  for (let n = 0; startAt + (n * beat) / 2 < seconds; n++) {
    const at = Math.floor((startAt + (n * beat) / 2) * SR)
    const kick = n % 2 === 0
    for (let i = 0; i < 2000 && at + i < pcm.length; i++) {
      const decay = Math.exp(-i / 300)
      pcm[at + i] += kick ? 0.8 * decay * Math.sin((2 * Math.PI * 60 * i) / SR) : 0.3 * decay * Math.sin((2 * Math.PI * 7000 * i) / SR)
    }
  }
  return pcm
}

describe('refineBpm', () => {
  it("finds 175 where the beat tracker's frames only allow 172.27", () => {
    expect(refineBpm(clickTrack(175, 60), 172.265)).toBe(175)
  })

  it('finds the tempo from above and from below', () => {
    expect(refineBpm(clickTrack(170, 60), 172.265)).toBe(170)
    expect(refineBpm(clickTrack(168, 60), 166.169)).toBe(168)
    expect(refineBpm(clickTrack(140, 60), 139.986)).toBe(140)
  })

  it('keeps a tempo that is not a whole number, to a hundredth', () => {
    expect(refineBpm(clickTrack(173.37, 90), 172.265)).toBeCloseTo(173.37, 1)
    expect(refineBpm(clickTrack(128.5, 90), 129.2)).toBeCloseTo(128.5, 1)
  })

  it('does not depend on where the first beat is', () => {
    expect(refineBpm(clickTrack(175, 60, 0.137), 172.265)).toBe(175)
  })

  it("stays in the tracker's tempo octave: half time is not turned into full", () => {
    expect(refineBpm(clickTrack(175, 60), 87.6)).toBe(87.5)
  })

  it("keeps the tracker's tempo when there is too little to go on", () => {
    expect(refineBpm(clickTrack(175, 5), 172.265)).toBe(172.265)
    expect(refineBpm(new Float32Array(SR * 30), 172.265)).toBe(172.265)
    let seed = 1
    const noise = Float32Array.from({ length: SR * 30 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5)
    expect(refineBpm(noise, 172.265)).toBe(172.265)
    expect(refineBpm(clickTrack(175, 60), 0)).toBe(0)
  })
})

// A broken beat: kicks on beats 1 and 2.5 of the bar, snares on 2 and 4,
// hats on every half beat — nothing on a plain four-to-the-floor grid.
function brokenBeat(bpm: number, seconds: number): Float32Array {
  const pcm = new Float32Array(Math.floor(seconds * SR))
  const half = 60 / bpm / 2
  const burst = (at: number, level: number, hz: number, decaySamples: number) => {
    const start = Math.floor(at * SR)
    for (let i = 0; i < 3000 && start + i < pcm.length; i++) pcm[start + i] += level * Math.exp(-i / decaySamples) * Math.sin((2 * Math.PI * hz * i) / SR)
  }
  for (let n = 0; n * half < seconds; n++) {
    const step = n % 8
    burst(n * half, 0.25, 7000, 200)
    if (step === 0 || step === 3) burst(n * half, 0.8, 60, 400)
    if (step === 2 || step === 6) burst(n * half, 0.6, 1800, 250)
  }
  return pcm
}

describe('refineBpm, when the tracker reports two thirds of the tempo', () => {
  it('takes the tempo one and a half times faster when the track is far stronger there', () => {
    expect(refineBpm(brokenBeat(160, 60), 106.67)).toBe(160)
    expect(refineBpm(brokenBeat(170, 60), 113.2)).toBe(170)
    expect(refineBpm(clickTrack(165, 60), 109.41)).toBe(165)
  })

  it('leaves a track that really is at that tempo alone', () => {
    expect(refineBpm(clickTrack(108, 60), 108.06)).toBe(108)
    expect(refineBpm(brokenBeat(108, 60), 108.06)).toBe(108)
    expect(refineBpm(clickTrack(128, 60), 128.03)).toBe(128)
  })

  it('never goes past 200 BPM', () => {
    expect(refineBpm(clickTrack(210, 60), 140)).toBe(140)
  })
})

describe('onsetEnvelope', () => {
  it('rises where a sound starts and averages to nothing', () => {
    const envelope = onsetEnvelope(clickTrack(120, 4))
    const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length
    expect(Math.abs(mean)).toBeLessThan(1e-3)
    // 120 BPM: a kick every 0.5 s, i.e. every 172.27 hops of 128 samples.
    const peak = envelope.indexOf(Math.max(...envelope))
    expect((peak * 128) / SR % 0.25).toBeLessThan(0.01)
  })

  it('is empty for next to nothing', () => {
    expect(onsetEnvelope(new Float32Array(100))).toHaveLength(0)
  })
})
