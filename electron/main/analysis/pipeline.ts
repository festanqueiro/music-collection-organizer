import { decodeToPcm } from './decode'
import { extractMetadata } from './metadata'
import { detectBpmAndKey } from './bpmKey'
import { computeWaveformPeaks } from './waveform'

export interface AnalysisPipelineResult {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  duration: number | null
  bpm: number
  musicalKey: string
  waveformPeaks: number[]
}

// The CPU-bound part of this (detectBpmAndKey) is synchronous, WASM-backed
// work. Callers that run many tracks in bulk (runAnalysisQueue) must run
// this inside a worker thread rather than the main process, or it blocks
// the whole app's event loop (IPC, window paint) for the duration of each
// track's analysis.
export async function runAnalysisPipeline(path: string): Promise<AnalysisPipelineResult> {
  const [metadata, pcm] = await Promise.all([extractMetadata(path), decodeToPcm(path)])
  const { bpm, key, scale } = detectBpmAndKey(pcm)
  const peaks = computeWaveformPeaks(pcm)

  return {
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    genre: metadata.genre,
    year: metadata.year,
    duration: metadata.duration,
    bpm,
    musicalKey: `${key} ${scale}`,
    waveformPeaks: peaks,
  }
}
