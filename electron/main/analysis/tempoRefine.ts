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

// The tempo near `center` the track agrees on best, how strongly, and
// whether it stands out from the others near it (twice their median).
function peakNear(envelope: Float32Array, fps: number, seconds: number, center: number): { bpm: number; score: number; clear: boolean } {
  // A tempo's peak is about 60 / seconds BPM wide: a quarter of that per step finds it.
  const coarse = Math.min(0.25, (0.25 * 60) / seconds)
  let best = center
  let bestScore = -1
  const scores: number[] = []
  for (let bpm = center * (1 - SEARCH); bpm <= center * (1 + SEARCH); bpm += coarse) {
    const score = strength(envelope, fps, bpm)
    scores.push(score)
    if (score > bestScore) {
      bestScore = score
      best = bpm
    }
  }
  const median = [...scores].sort((a, b) => a - b)[scores.length >> 1]
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
  return { bpm: best, score: bestScore, clear: bestScore > 2 * median }
}

// On broken beats (jungle, footwork, 160) the tracker often follows every
// third half-beat and reports two thirds of the tempo: 106.67 for 160, 113
// for 170. The real tempo is then far stronger in the track than the one
// reported — 1.8 to 11.7 times on the nine such tracks measured, against
// 1.47 times at most for the 23 that were right
// (docs/research/bpm-accuracy.md). Above this ratio the tempo one and a
// half times faster is taken instead. The gap is narrow: a track can still
// come out wrong either way, which is what Refine BPM in a track's menu is
// for.
const THREE_HALVES_RATIO = 1.65
// Nothing is moved past this: no faster tempo is mixed as such.
const FASTEST_BPM = 200

// The tempo the whole track agrees on best, to 0.01 BPM — and to the whole
// number when it's within 0.03 of one, which is where produced music sits.
// Looked for near `roughBpm`, and near one and a half times it (see
// THREE_HALVES_RATIO) unless `threeHalves` is off — for a tempo the user
// chose, which is only sharpened. `roughBpm` comes back unchanged when
// there's too little to go on (under ten seconds, or no tempo standing out).
export function refineBpm(pcm: Float32Array, roughBpm: number, sampleRate = 44100, threeHalves = true): number {
  if (!(roughBpm > 0)) return roughBpm
  const seconds = pcm.length / sampleRate
  if (seconds < 10) return roughBpm
  const envelope = onsetEnvelope(pcm, sampleRate)
  const fps = sampleRate / HOP
  const near = peakNear(envelope, fps, seconds, roughBpm)
  let found = near.clear ? near : null
  if (threeHalves && roughBpm * 1.5 * (1 + SEARCH) <= FASTEST_BPM) {
    const faster = peakNear(envelope, fps, seconds, roughBpm * 1.5)
    if (faster.clear && faster.score > THREE_HALVES_RATIO * near.score) found = faster
  }
  if (!found) return roughBpm
  const whole = Math.round(found.bpm)
  return Math.abs(found.bpm - whole) <= 0.03 ? whole : Math.round(found.bpm * 100) / 100
}

// Half time. A tune at 165 BPM is as honestly 82.5: the tracker picks
// either, and nothing in the audio settles it — measured against a
// Rekordbox collection, the doubled tempo is no stronger in the tracks
// Rekordbox doubles than in the ones it leaves (docs/research/bpm-accuracy.md).
// So it is a convention, the one DJ software uses: a slowest tempo, below
// which the BPM is doubled. The doubled tempo is then sharpened on the
// audio like any other (82.37 × 2 → 165), unless the audio lands somewhere
// else, in which case the plain product is kept.
export const DEFAULT_SLOWEST_BPM = 90

export function doubleIfSlow(pcm: Float32Array, bpm: number, slowestBpm: number | null, sampleRate = 44100): number {
  if (!slowestBpm || !(bpm > 0) || bpm >= slowestBpm || bpm * 2 > FASTEST_BPM) return bpm
  const doubled = bpm * 2
  const measured = refineBpm(pcm, doubled, sampleRate, false)
  return Math.abs(measured / doubled - 1) <= SEARCH && measured !== doubled ? measured : Math.round(doubled * 100) / 100
}

// The tempo analysis stores: the tracker's, sharpened over the whole track
// (and moved to 1.5× when it reported two thirds), then doubled if it is
// slower than the slowest tempo the user mixes at.
export function analysedBpm(pcm: Float32Array, trackerBpm: number, slowestBpm: number | null = null, sampleRate = 44100): number {
  return doubleIfSlow(pcm, refineBpm(pcm, trackerBpm, sampleRate), slowestBpm, sampleRate)
}
