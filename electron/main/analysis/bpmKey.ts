// @ts-expect-error essentia.js has no bundled TypeScript definitions for its default (index.js) export
import { Essentia, EssentiaWASM } from 'essentia.js'

let essentiaInstance: any | null = null

function getEssentia(): any {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM)
  }
  return essentiaInstance
}

export interface BpmKeyResult {
  bpm: number
  key: string
  scale: string
}

export function detectBpmAndKey(pcm: Float32Array): BpmKeyResult {
  const essentia = getEssentia()
  const vector = essentia.arrayToVector(pcm)

  try {
    const rhythm = essentia.RhythmExtractor2013(vector)
    const keyResult = essentia.KeyExtractor(vector)

    return {
      bpm: rhythm.bpm,
      key: keyResult.key,
      scale: keyResult.scale,
    }
  } finally {
    vector.delete()
  }
}
