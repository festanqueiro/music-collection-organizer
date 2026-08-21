import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import type { AppDatabase } from '../db'
import { runAnalysisPipeline } from './pipeline'
import type { WorkerResult, WorkerTask } from './worker'

function writeAnalysisResult(
  db: AppDatabase,
  track: { id: number; path: string },
  result: Awaited<ReturnType<typeof runAnalysisPipeline>>
): void {
  db.prepare(
    `UPDATE tracks SET
      title = @title, artist = @artist, album = @album, genre_tag = @genre, year = @year, duration = @duration,
      bpm = @bpm, musical_key = @musical_key, waveform_peaks = @waveform_peaks,
      analysis_status = 'done', analyzed_at = @analyzed_at
    WHERE id = @id`
  ).run({
    id: track.id,
    title: result.title,
    artist: result.artist,
    album: result.album,
    genre: result.genre,
    year: result.year,
    duration: result.duration,
    bpm: result.bpm,
    musical_key: result.musicalKey,
    waveform_peaks: JSON.stringify(result.waveformPeaks),
    analyzed_at: Date.now(),
  })
}

// Single-track analysis, run in-process. Used by the cloud-download flow,
// where one file is analyzed right after being materialized locally — a
// brief main-thread block for one track is an acceptable tradeoff there,
// unlike a bulk scan of a whole collection (see runAnalysisQueue below).
export async function analyzeTrack(db: AppDatabase, track: { id: number; path: string }): Promise<void> {
  db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
  try {
    const result = await runAnalysisPipeline(track.path)
    writeAnalysisResult(db, track, result)
  } catch {
    db.prepare("UPDATE tracks SET analysis_status = 'error' WHERE id = ?").run(track.id)
  }
}

// This module's compiled code is bundled into out/main/index.js (via
// index.ts's import graph), not into its own file — so this path is
// relative to index.js's location, not to this source file's location.
const WORKER_ENTRY = fileURLToPath(new URL('./analysis/worker.js', import.meta.url))

// Sequential in-process fallback, used when the built worker chunk isn't
// present (e.g. under Vitest, which runs this module's TS source directly
// rather than the bundled out/main/ output). Functionally correct — just
// not off the main thread.
async function runAnalysisQueueInProcess(
  db: AppDatabase,
  tracks: { id: number; path: string }[],
  options: { onProgress?: (progress: { done: number; total: number }) => void }
): Promise<void> {
  const total = tracks.length
  let done = 0
  for (const track of tracks) {
    await analyzeTrack(db, track)
    done++
    options.onProgress?.({ done, total })
  }
}

// Bulk analysis over many tracks (e.g. after a folder scan). The CPU-bound
// essentia.js work is synchronous, so this runs it inside a pool of
// worker_threads rather than the main process — otherwise it blocks the
// whole app's event loop (IPC, window paint) for the duration of the scan.
// DB writes stay on the main thread (better-sqlite3/node:sqlite must only
// be touched there).
export async function runAnalysisQueue(
  db: AppDatabase,
  tracks: { id: number; path: string }[],
  options: { concurrency: number; onProgress?: (progress: { done: number; total: number }) => void }
): Promise<void> {
  const total = tracks.length
  if (total === 0) return

  if (!existsSync(WORKER_ENTRY)) {
    return runAnalysisQueueInProcess(db, tracks, options)
  }

  let done = 0
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(options.concurrency, tracks.length))

  await new Promise<void>((resolve, reject) => {
    const workers: Worker[] = []
    let settled = false
    // Tracks currently assigned to a worker (status already flipped to
    // 'analyzing') but whose result hasn't come back yet. If a worker
    // errors out, finish() terminates every worker immediately — without
    // this, whatever was in-flight at that moment would stay stuck showing
    // 'analyzing' in the UI forever, since nothing else ever updates it.
    const inFlightTrackIds = new Set<number>()

    function finish(err?: Error) {
      if (settled) return
      settled = true
      if (err) {
        for (const id of inFlightTrackIds) {
          db.prepare("UPDATE tracks SET analysis_status = 'error' WHERE id = ?").run(id)
        }
        inFlightTrackIds.clear()
      }
      for (const w of workers) w.terminate()
      if (err) reject(err)
      else resolve()
    }

    function assignNext(worker: Worker) {
      if (nextIndex >= tracks.length) return
      const track = tracks[nextIndex++]
      db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
      inFlightTrackIds.add(track.id)
      const task: WorkerTask = { id: track.id, path: track.path }
      worker.postMessage(task)
    }

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(WORKER_ENTRY)
      workers.push(worker)

      worker.on('message', (msg: WorkerResult) => {
        const track = tracks.find((t) => t.id === msg.id)!
        inFlightTrackIds.delete(msg.id)
        if (msg.status === 'done') {
          writeAnalysisResult(db, track, msg.result)
        } else {
          db.prepare("UPDATE tracks SET analysis_status = 'error' WHERE id = ?").run(track.id)
        }
        done++
        options.onProgress?.({ done, total })

        if (nextIndex < tracks.length) {
          assignNext(worker)
        } else if (done >= total) {
          finish()
        }
      })

      worker.on('error', (err: Error) => finish(err))

      assignNext(worker)
    }
  })
}
