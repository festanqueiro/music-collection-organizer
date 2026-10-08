import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import type { AppDatabase } from '../db'
import { runAnalysisPipeline } from './pipeline'
import { getPlayableFilePath } from '../audioTranscode'
import type { TempoTask, WorkerResult, WorkerTask } from './worker'
import { decodeToPcm } from './decode'
import { analysedBpm, refineBpm } from './tempoRefine'
import { describeAnalysisError } from './errorMessage'

// Tracks an analysis run was part-way through when the app last closed are
// still marked 'analyzing': nothing is analysing them, and a bulk run only
// picks 'pending' and 'error'. Called once at startup; returns how many.
export function resetInterruptedAnalysis(db: AppDatabase): number {
  return Number(db.prepare("UPDATE tracks SET analysis_status = 'pending' WHERE analysis_status = 'analyzing'").run().changes)
}

function markFailed(db: AppDatabase, trackId: number, reason: string): void {
  db.prepare("UPDATE tracks SET analysis_status = 'error', analysis_error = ? WHERE id = ?").run(reason, trackId)
}

function writeAnalysisResult(
  db: AppDatabase,
  track: { id: number; path: string },
  result: Awaited<ReturnType<typeof runAnalysisPipeline>>
): void {
  db.prepare(
    `UPDATE tracks SET
      title = @title, artist = @artist, album = @album, genre_tag = @genre, year = @year, duration = @duration, bitrate = @bitrate,
      bpm = CASE WHEN bpm_edited = 1 THEN bpm ELSE @bpm END, first_beat = @first_beat, musical_key = @musical_key, waveform_peaks = @waveform_peaks, waveform_bands = @waveform_bands,
      loudness = @loudness, energy = @energy,
      analysis_status = 'done', analysis_error = NULL, analyzed_at = @analyzed_at, tags_read_at = @analyzed_at
    WHERE id = @id`
  ).run({
    id: track.id,
    title: result.title,
    artist: result.artist,
    album: result.album,
    genre: result.genre,
    year: result.year,
    duration: result.duration,
    bitrate: result.bitrate,
    bpm: result.bpm,
    first_beat: result.firstBeat,
    musical_key: result.musicalKey,
    waveform_peaks: JSON.stringify(result.waveformPeaks),
    waveform_bands: JSON.stringify(result.waveformBands),
    loudness: result.loudness,
    energy: result.energy,
    analyzed_at: Date.now(),
  })
}

// Single-track analysis, run in-process. Used by the cloud-download flow,
// where one file is analyzed right after being materialized locally — a
// brief main-thread block for one track is an acceptable tradeoff there,
// unlike a bulk scan of a whole collection (see runAnalysisQueue below).
export async function analyzeTrack(
  db: AppDatabase,
  track: { id: number; path: string },
  cacheDir: string,
  slowestBpm: number | null = null
): Promise<void> {
  db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
  try {
    // Resolves to the already-transcoded FLAC cache for AIFF (a no-op for
    // every other format) — same file playback reads, so analyzing a track
    // that's also being played right now (e.g. auto-analysis kicked off by
    // loading a not-yet-analyzed track into the player) doesn't open a
    // second, independent ffmpeg read of the original source file. That
    // matters most for a cloud-synced source (Google Drive for Desktop,
    // etc.), where two concurrent reads of a not-fully-synced file can
    // race each other.
    const playablePath = await getPlayableFilePath(track.path, cacheDir)
    const result = await runAnalysisPipeline(playablePath, track.path, undefined, slowestBpm)
    writeAnalysisResult(db, track, result)
  } catch (err) {
    markFailed(db, track.id, describeAnalysisError(err))
  }
}

// This module's compiled code is bundled into out/main/index.js (via
// index.ts's import graph), not into its own file — so this path is
// relative to index.js's location, not to this source file's location.
const WORKER_ENTRY = fileURLToPath(new URL('./analysis/worker.js', import.meta.url))

// Refine BPM sharpens a tempo on the track's audio: a decode and a few
// hundred milliseconds of arithmetic per track, which froze the window when
// done in the main process for a batch. One worker, kept for the batch,
// answers one track at a time; `close` ends it. Without the built worker
// (under Vitest) it's measured in-process.
// `mode`: 'near' sharpens a tempo the user multiplied; 'again' measures as
// analysis would, starting from the stored tempo.
export function createTempoMeasurer(
  cacheDir: string,
  slowestBpm: number | null = null
): { measure: (path: string, target: number, mode?: 'near' | 'again') => Promise<number | null>; close: () => void } {
  if (!existsSync(WORKER_ENTRY)) {
    return {
      measure: async (path, target, mode = 'near') => {
        const pcm = await decodeToPcm(await getPlayableFilePath(path, cacheDir))
        const refined = mode === 'again' ? analysedBpm(pcm, target, slowestBpm) : refineBpm(pcm, target, 44100, false)
        return refined === target ? null : refined
      },
      close: () => {},
    }
  }
  const worker = new Worker(WORKER_ENTRY)
  const waiting = new Map<number, (bpm: number | null) => void>()
  let nextId = 1
  const giveUp = () => {
    for (const resolve of waiting.values()) resolve(null)
    waiting.clear()
  }
  worker.on('message', (msg: WorkerResult) => {
    if (msg.status !== 'tempo') return
    waiting.get(msg.id)?.(msg.bpm)
    waiting.delete(msg.id)
  })
  // A tempo that couldn't be measured is just not sharpened.
  worker.on('error', giveUp)
  worker.on('exit', giveUp)
  return {
    measure: (path, target, mode = 'near') =>
      new Promise((resolve) => {
        const id = nextId++
        waiting.set(id, resolve)
        const task: TempoTask = { kind: 'tempo', id, path, cacheDir, target, mode, slowestBpm }
        worker.postMessage(task)
      }),
    close: () => void worker.terminate(),
  }
}

// Sequential in-process fallback, used when the built worker chunk isn't
// present (e.g. under Vitest, which runs this module's TS source directly
// rather than the bundled out/main/ output). Functionally correct — just
// not off the main thread.
async function runAnalysisQueueInProcess(
  db: AppDatabase,
  tracks: { id: number; path: string }[],
  options: {
    cacheDir: string
    // Below it the tempo is doubled (the Library setting); null leaves it.
    slowestBpm?: number | null
    onProgress?: (progress: { done: number; total: number }) => void
    signal?: AbortSignal
  }
): Promise<void> {
  const total = tracks.length
  let done = 0
  for (const track of tracks) {
    if (options.signal?.aborted) break
    await analyzeTrack(db, track, options.cacheDir, options.slowestBpm ?? null)
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
//
// cacheDir: passed in explicitly (not fetched internally via
// app.getPath) rather than computed in this module — keeps queue.ts free
// of a hard Electron-app dependency, same as the rest of this module's
// path-taking functions, and lets tests pass a plain temp directory.
export async function runAnalysisQueue(
  db: AppDatabase,
  tracks: { id: number; path: string }[],
  options: {
    concurrency: number
    cacheDir: string
    // Below it the tempo is doubled (the Library setting); null leaves it.
    slowestBpm?: number | null
    // done may be fractional: it includes how far the in-flight tracks are.
    onProgress?: (progress: { done: number; total: number }) => void
    signal?: AbortSignal
  }
): Promise<void> {
  const total = tracks.length
  if (total === 0) return

  if (!existsSync(WORKER_ENTRY)) {
    return runAnalysisQueueInProcess(db, tracks, options)
  }

  let done = 0
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(options.concurrency, tracks.length))
  // Looked up once per completed message instead of tracks.find() — an
  // O(n) scan per message would make the whole dispatch loop O(n²) over a
  // large bulk analysis.
  const tracksById = new Map(tracks.map((t) => [t.id, t]))
  const { cacheDir } = options
  // How far through each in-flight track is (0..1), so `done` can count
  // partly analysed tracks too — otherwise, with several tracks running in
  // parallel, the bar sits still and then jumps.
  const partial = new Map<number, number>()
  const reportProgress = () => {
    let inFlight = 0
    for (const fraction of partial.values()) inFlight += fraction
    options.onProgress?.({ done: done + inFlight, total })
  }

  await new Promise<void>((resolve, reject) => {
    const workers: Worker[] = []
    let settled = false
    // Tracks currently assigned to a worker (status already flipped to
    // 'analyzing') but whose result hasn't come back yet. If a worker
    // errors out, finish() terminates every worker immediately — without
    // this, whatever was in-flight at that moment would stay stuck showing
    // 'analyzing' in the UI forever, since nothing else ever updates it.
    const inFlightTrackIds = new Set<number>()

    // On a real failure in-flight tracks are marked 'error' (they were
    // actually attempted and something went wrong); on a deliberate
    // cancellation they're reset to 'pending' instead, since nothing
    // actually went wrong with them — they just didn't get a chance to
    // run, and should be picked up again by a future analysis run.
    function finish(err?: Error, cancelled = false) {
      if (settled) return
      settled = true
      if (err || cancelled) {
        for (const id of inFlightTrackIds) {
          if (cancelled) db.prepare("UPDATE tracks SET analysis_status = 'pending' WHERE id = ?").run(id)
          else markFailed(db, id, `The analysis stopped: ${describeAnalysisError(err)}`)
        }
        inFlightTrackIds.clear()
      }
      for (const w of workers) w.terminate()
      if (err) reject(err)
      else resolve()
    }

    if (options.signal) {
      if (options.signal.aborted) {
        finish(undefined, true)
      } else {
        options.signal.addEventListener('abort', () => finish(undefined, true), { once: true })
      }
    }

    function assignNext(worker: Worker) {
      if (settled || nextIndex >= tracks.length) return
      const track = tracks[nextIndex++]
      db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
      inFlightTrackIds.add(track.id)
      const task: WorkerTask = { id: track.id, path: track.path, cacheDir, slowestBpm: options.slowestBpm ?? null }
      worker.postMessage(task)
    }

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(WORKER_ENTRY)
      workers.push(worker)

      worker.on('message', (msg: WorkerResult) => {
        // A sibling worker's error can call finish() (which terminates
        // every worker, including this one) between this message being
        // queued and this handler actually running — without this guard,
        // that stale message would still run: overwriting a track finish()
        // already marked 'error', pushing done past total, and potentially
        // calling postMessage() on an already-terminated worker.
        if (settled) return

        if (msg.status === 'progress') {
          partial.set(msg.id, msg.fraction)
          reportProgress()
          return
        }
        // An answer to a tempo question: not asked of these workers.
        if (msg.status === 'tempo') return
        partial.delete(msg.id)

        const track = tracksById.get(msg.id)!
        try {
          if (msg.status === 'done') {
            writeAnalysisResult(db, track, msg.result)
          } else {
            markFailed(db, track.id, msg.message)
          }
        } catch (writeErr) {
          console.error('failed to write analysis result', writeErr)
          try {
            markFailed(db, track.id, `Couldn't save the result: ${describeAnalysisError(writeErr)}`)
          } catch {
            // Best effort — if even this fails, inFlightTrackIds below
            // still hasn't been cleared for this track, so a later
            // finish(err) sweep (if one happens) can still catch it.
          }
        } finally {
          inFlightTrackIds.delete(msg.id)
        }

        done++
        reportProgress()

        if (nextIndex < tracks.length) {
          assignNext(worker)
        } else if (done >= total) {
          finish()
        }
      })

      worker.on('error', (err: Error) => finish(err))

      // A worker can die (native crash, explicit process exit inside the
      // thread) without ever emitting Node's 'error' event — only 'exit'
      // is guaranteed there. Without this, that path would leave
      // whatever was in-flight on this worker stuck 'analyzing' forever,
      // and this whole runAnalysisQueue() call never settles.
      worker.on('exit', (code) => {
        if (code !== 0) finish(new Error(`Analysis worker exited with code ${code}`))
      })

      assignNext(worker)
    }
  })
}
