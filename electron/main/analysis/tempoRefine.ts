// The beat tracker (bpmKey.ts) follows beats in whole analysis frames
// (512 samples at 44.1 kHz), so on fast music the tempo it reports can only
// be one of a few values: 30 frames a beat is 172.27 BPM, 29 is 178.21 —
// a 175 BPM tune comes out as 172.27. A beat or so off after 16 bars, a
// whole bar after 64 (docs/research/bpm-accuracy.md), which is what the bar
// counter and the suggested cues count with.
//
// Dance music keeps one tempo, so it can be measured over the whole track
// instead: how strongly the onsets repeat at each tempo near the tracker's
// (and at twice and four times it, where the hats and snares are), in
// steps far finer than a frame. The tracker still decides which tempo
// octave it is; this only sharpens it.

const HOP = 128
// How far from the tracker's tempo to look: a little more than half the
// gap between two of its values at 180 BPM.
const SEARCH = 0.035
const HARMONICS = [1, 2, 4]

// How much new sound starts in each hop, in three bands (bass, the whole
// signal, highs) so a kick, a snare and a hat all count: the rise of the
// log-energy, summed. The mean is taken off so silence scores nothing.
export function onsetEnvelope(pcm: Float32Array, sampleRate = 44100): Float32Array {
  const frames = Math.floor(pcm.length / HOP)
  const out = new Float32Array(Math.max(0, frames))
  if (frames < 2) return out
  const lowA = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate)
  const midA = 1 - Math.exp((-2 * Math.PI * 4000) / sampleRate)
  let low = 0
  let mid = 0
  const previous = [0, 0, 0]
  let sum = 0
  for (let f = 0; f < frames; f++) {
    const energy = [0, 0, 0]
    for (let i = f * HOP, end = i + HOP; i < end; i++) {
      const x = pcm[i]
      low += lowA * (x - low)
      mid += midA * (x - mid)
      const high = x - mid
      energy[0] += low * low
      energy[1] += x * x
      energy[2] += high * high
    }
    let rise = 0
    for (let b = 0; b < 3; b++) {
      const level = Math.log1p(1000 * (energy[b] / HOP))
      if (f > 0 && level > previous[b]) rise += level - previous[b]
      previous[b] = level
    }
    out[f] = rise
    sum += rise
  }
  const mean = sum / frames
  for (let f = 0; f < frames; f++) out[f] -= mean
  return out
}

// How strongly the envelope repeats `bpm` times a minute (and at its
// harmonics): the size of its Fourier component there.
function strength(envelope: Float32Array, framesPerSecond: number, bpm: number): number {
  let total = 0
  for (const harmonic of HARMONICS) {
    const step = (2 * Math.PI * (bpm / 60) * harmonic) / framesPerSecond
    // A phasor turned by `step` each frame, rather than a sin and cos each.
    const cos = Math.cos(step)
    const sin = Math.sin(step)
    let re = 1
    let im = 0
    let sumRe = 0
    let sumIm = 0
    for (let n = 0; n < envelope.length; n++) {
      sumRe += envelope[n] * re
      sumIm += envelope[n] * im
      const next = re * cos - im * sin
      im = re * sin + im * cos
      re = next
      // Rounding creeps in over a hundred thousand turns.
      if ((n & 1023) === 1023) {
        const size = Math.hypot(re, im)
        re /= size
        im /= size
      }
    }
    total += Math.hypot(sumRe, sumIm)
  }
  return total
}

// The tempo near `roughBpm` the whole track agrees on best, to 0.01 BPM —
// and to the whole number when it's within 0.03 of one, which is where
// produced music sits. `roughBpm` comes back unchanged when there's too
// little to go on (under ten seconds, or no tempo standing out).
export function refineBpm(pcm: Float32Array, roughBpm: number, sampleRate = 44100): number {
  if (!(roughBpm > 0)) return roughBpm
  const seconds = pcm.length / sampleRate
  if (seconds < 10) return roughBpm
  const envelope = onsetEnvelope(pcm, sampleRate)
  const fps = sampleRate / HOP
  // A tempo's peak is about 60 / seconds BPM wide: a quarter of that per step finds it.
  const coarse = Math.min(0.25, (0.25 * 60) / seconds)
  const from = roughBpm * (1 - SEARCH)
  const to = roughBpm * (1 + SEARCH)
  let best = roughBpm
  let bestScore = -1
  const scores: number[] = []
  for (let bpm = from; bpm <= to; bpm += coarse) {
    const score = strength(envelope, fps, bpm)
    scores.push(score)
    if (score > bestScore) {
      bestScore = score
      best = bpm
    }
  }
  const median = [...scores].sort((a, b) => a - b)[scores.length >> 1]
  if (!(bestScore > 2 * median)) return roughBpm
  // Then closer around it, down to a thousandth.
  for (let step = coarse / 4; step >= 0.0005; step /= 4) {
    for (const bpm of [best - 2 * step, best - step, best + step, best + 2 * step]) {
      const score = strength(envelope, fps, bpm)
      if (score > bestScore) {
        bestScore = score
        best = bpm
      }
    }
  }
  const whole = Math.round(best)
  return Math.abs(best - whole) <= 0.03 ? whole : Math.round(best * 100) / 100
}
