// @ts-expect-error essentia.js has no bundled TypeScript definitions for its default (index.js) export
import { Essentia, EssentiaWASM } from 'essentia.js'

let essentiaInstance: any | null = null

function getEssentia(): any {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM)
  }
  return essentiaInstance
}

export interface EnergyResult {
  // Integrated loudness (EBU R128), in LUFS.
  loudness: number
  // 1 (sparse and quiet) .. 10 (dense and loud).
  energy: number
}

// A rough "energy" rating in the spirit of DJ software's: how loud the
// track is overall plus how busy it is (onsets per second). Both are
// mapped onto the range most club music falls in, then weighted.
export function energyRating(loudness: number, onsetRate: number): number {
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  const loud = clamp01((loudness + 20) / 14) // -20 LUFS .. -6 LUFS
  const busy = clamp01(onsetRate / 6) // 0 .. 6 onsets a second
  return Math.round(1 + 9 * (0.55 * loud + 0.45 * busy))
}

// pcm: mono, 44.1 kHz (decodeToPcm's default). EBU R128 wants a stereo
// pair; the mono downmix on both sides reads about the same as the
// original stereo for typical, mostly-centred mixes.
export function detectEnergy(pcm: Float32Array): EnergyResult {
  const essentia = getEssentia()
  const vector = essentia.arrayToVector(pcm)
  try {
    const loudness: number = essentia.LoudnessEBUR128(vector, vector).integratedLoudness
    const onsetRate: number = essentia.OnsetRate(vector).onsetRate
    return { loudness: Math.round(loudness * 10) / 10, energy: energyRating(loudness, onsetRate) }
  } finally {
    vector.delete()
  }
}
