// @ts-expect-error essentia.js has no bundled TypeScript definitions for its default (index.js) export
import { Essentia, EssentiaWASM } from 'essentia.js'
import { refineBpm } from './tempoRefine'

let essentiaInstance: any | null = null

function getEssentia(): any {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM)
  }
  return essentiaInstance
}

export interface BpmKeyResult {
  bpm: number
  // Where the first beat is (seconds) — where the beat grid starts, for
  // suggested hot cues every 16 bars (docs/features/hot-cues.md).
  firstBeat: number
  key: string
  scale: string
}

export function detectBpmAndKey(pcm: Float32Array): BpmKeyResult {
  const essentia = getEssentia()
  const vector = essentia.arrayToVector(pcm)

  try {
    const rhythm = essentia.RhythmExtractor2013(vector)
    const keyResult = essentia.KeyExtractor(vector)

    // vectorToArray throws on an empty vector (no beats found, e.g. a tone).
    const ticks: ArrayLike<number> = rhythm.ticks.size() > 0 ? essentia.vectorToArray(rhythm.ticks) : []
    return {
      // The tracker's tempo is only as fine as its frames: sharpened over
      // the whole track (tempoRefine.ts, ADR 0062).
      bpm: refineBpm(pcm, rhythm.bpm),
      firstBeat: firstBeatFrom(ticks, pcm),
      key: keyResult.key,
      scale: keyResult.scale,
    }
  } finally {
    vector.delete()
  }
}

// The beat tracker extrapolates beats into a silent or near-silent intro, so
// its first tick can be a beat or two before the music starts — which would
// put every suggested cue that much early. The first beat is the first tick
// at (or just before) the first sound: where the signal first reaches 5 % of
// its peak.
export function firstBeatFrom(ticks: ArrayLike<number>, pcm: Float32Array, sampleRate = 44100): number {
  if (ticks.length === 0) return 0
  let peak = 0
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]))
  let firstSound = 0
  if (peak > 0) {
    const i = pcm.findIndex((v) => Math.abs(v) >= peak * 0.05)
    firstSound = Math.max(0, i) / sampleRate
  }
  for (let i = 0; i < ticks.length; i++) {
    if (ticks[i] >= firstSound - 0.07) return Math.round(ticks[i] * 1000) / 1000
  }
  return Math.round(ticks[0] * 1000) / 1000
}
