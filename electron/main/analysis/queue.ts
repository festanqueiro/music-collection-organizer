import type { AppDatabase } from '../db'
import { decodeToPcm } from './decode'
import { extractMetadata } from './metadata'
import { detectBpmAndKey } from './bpmKey'
import { computeWaveformPeaks } from './waveform'

export async function analyzeTrack(db: AppDatabase, track: { id: number; path: string }): Promise<void> {
  db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
  try {
    const [metadata, pcm] = await Promise.all([extractMetadata(track.path), decodeToPcm(track.path)])
    const { bpm, key, scale } = detectBpmAndKey(pcm)
    const peaks = computeWaveformPeaks(pcm)

    db.prepare(
      `UPDATE tracks SET
        title = @title, artist = @artist, album = @album, genre_tag = @genre, year = @year, duration = @duration,
        bpm = @bpm, musical_key = @musical_key, waveform_peaks = @waveform_peaks,
        analysis_status = 'done', analyzed_at = @analyzed_at
      WHERE id = @id`
    ).run({
      id: track.id,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      genre: metadata.genre,
      year: metadata.year,
      duration: metadata.duration,
      bpm,
      musical_key: `${key} ${scale}`,
      waveform_peaks: JSON.stringify(peaks),
      analyzed_at: Date.now(),
    })
  } catch {
    db.prepare("UPDATE tracks SET analysis_status = 'error' WHERE id = ?").run(track.id)
  }
}

export async function runAnalysisQueue(
  db: AppDatabase,
  tracks: { id: number; path: string }[],
  options: { concurrency: number; onProgress?: (progress: { done: number; total: number }) => void }
): Promise<void> {
  const total = tracks.length
  let done = 0
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tracks.length) {
      const track = tracks[nextIndex++]
      await analyzeTrack(db, track)
      done++
      options.onProgress?.({ done, total })
    }
  }

  const workers = Array.from({ length: Math.min(options.concurrency, tracks.length) }, () => worker())
  await Promise.all(workers)
}
