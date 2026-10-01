// A detailed waveform of one part of a track (docs/features/hot-cues.md):
// the zoom shown while dragging a hot cue. The whole-track waveform has 800
// peaks — under half a second each on a six-minute track — so this decodes
// just the section, at `perSecond` peaks a second.
import { decodeToPcm } from './analysis/decode'
import { getPlayableFilePath } from './audioTranscode'
import { computeWaveformPeaks } from './analysis/waveform'
import type { WaveformSection } from '../../src/types'

const SAMPLE_RATE = 11025

export async function waveformSection(path: string, cacheDir: string, start: number, length: number, perSecond = 200): Promise<WaveformSection> {
  const from = Math.max(0, start)
  const playable = await getPlayableFilePath(path, cacheDir)
  const pcm = await decodeToPcm(playable, SAMPLE_RATE, { start: from, duration: length })
  const seconds = pcm.length / SAMPLE_RATE
  const count = Math.max(1, Math.round(seconds * perSecond))
  return { start: from, perSecond: count / Math.max(seconds, 1e-6), peaks: computeWaveformPeaks(pcm, count) }
}
