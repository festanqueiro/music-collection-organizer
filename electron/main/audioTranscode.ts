import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { resolveFfmpegPath } from './ffmpegPath'

// Chromium's <audio> element has no built-in AIFF decoder (it only supports
// WAV, MP3, FLAC, AAC, and Ogg/WebM) — AIFF files scan and analyze fine
// (ffmpeg-static, used by analysis/decode.ts, can decode them for
// waveform/BPM extraction) but silently fail to play back through the
// media:// protocol, which otherwise just serves the raw file bytes.
const TRANSCODABLE_EXTENSIONS = new Set(['.aiff', '.aif'])

export function needsTranscode(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return false
  return TRANSCODABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

// Cast devices (Google's player, and MCO's receiver on the device) crash or
// stall seeking in — or starting part-way into — a FLAC without a SEEKTABLE,
// which is every FLAC this bundled ffmpeg writes (see getPlayableFilePath).
// So what gets cast is 16-bit PCM WAV instead: lossless at CD quality,
// seekable by plain byte arithmetic, supported by every Cast device, and
// nearly instant to produce. Compressed formats with their own seek index
// pass through unchanged.
const CAST_PASSTHROUGH_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus'])

export function needsCastTranscode(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  return dot === -1 || !CAST_PASSTHROUGH_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}

function cacheKeyFor(filePath: string, mtimeMs: number): string {
  return createHash('sha256').update(`${filePath}:${mtimeMs}`).digest('hex')
}

// In-flight transcodes, keyed by cache path. Every media:// request for an
// uncached AIFF — the initial load plus each Range request a seek fires —
// used to spawn its own full ffmpeg transcode until the first one landed.
// Concurrent callers in the same thread now share one. (A worker_thread has
// its own copy of this map; the per-caller tmp file below still covers
// that cross-thread race.)
const inFlightTranscodes = new Map<string, Promise<string>>()

// Returns a path Chromium's <audio> element can actually play. Non-AIFF
// files pass through unchanged. AIFF files are transcoded once to FLAC
// (lossless, and natively playable) into cacheDir, keyed by the source
// file's path + mtime so an edited/replaced file re-transcodes rather than
// serving a stale cached version — repeat playback/seeking of the same
// track then just reuses the cached file instead of re-invoking ffmpeg.
export function getPlayableFilePath(filePath: string, cacheDir: string): Promise<string> {
  if (!needsTranscode(filePath)) return Promise.resolve(filePath)
  return cachedTranscode(filePath, cacheDir, '.flac', ['-f', 'flac'])
}

// Returns a path a cast device can play and seek in (see
// needsCastTranscode), converting into cacheDir the same way.
export function getCastableFilePath(filePath: string, cacheDir: string): Promise<string> {
  if (!needsCastTranscode(filePath)) return Promise.resolve(filePath)
  // -map 0:a: audio only — embedded cover art would otherwise become a
  // video stream WAV can't hold.
  return cachedTranscode(filePath, cacheDir, '.cast.wav', ['-map', '0:a', '-c:a', 'pcm_s16le', '-ar', '44100', '-f', 'wav'])
}

function cachedTranscode(filePath: string, cacheDir: string, suffix: string, outputArgs: string[]): Promise<string> {
  let mtimeMs: number
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch (err) {
    return Promise.reject(err)
  }

  const cachePath = join(cacheDir, `${cacheKeyFor(filePath, mtimeMs)}${suffix}`)
  if (existsSync(cachePath)) return Promise.resolve(cachePath)

  const inFlight = inFlightTranscodes.get(cachePath)
  if (inFlight) return inFlight

  const promise = transcodeToCache(filePath, cachePath, cacheDir, outputArgs).finally(() => {
    inFlightTranscodes.delete(cachePath)
  })
  inFlightTranscodes.set(cachePath, promise)
  return promise
}

function transcodeToCache(filePath: string, cachePath: string, cacheDir: string, outputArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static did not resolve a binary path for this platform/arch'))
      return
    }

    mkdirSync(cacheDir, { recursive: true })
    // Transcode to a .tmp path and rename into place once ffmpeg exits
    // successfully — a concurrent request for the same track (e.g. a fast
    // seek right after playback starts, or playback and analysis both
    // hitting an unanalyzed AIFF at the same moment — playback runs on the
    // main thread, analysis in a worker_thread, so they can't share an
    // in-memory dedup lock) must never see a half-written file. The tmp
    // path includes the PID and a random suffix so two concurrent callers
    // never write to the *same* tmp file — with a shared tmp name, whichever
    // rename ran second found its source already moved by the first and
    // crashed with ENOENT. Each caller now transcodes independently and
    // races only on the final rename, which is a plain overwrite on POSIX,
    // not a missing-source error, regardless of which one wins.
    const tmpPath = `${cachePath}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`
    const proc = spawn(ffmpegPath, ['-y', '-i', filePath, ...outputArgs, '-loglevel', 'error', tmpPath])

    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg transcode exited with code ${code}: ${stderr}`))
        return
      }
      try {
        renameSync(tmpPath, cachePath)
      } catch (err) {
        reject(err)
        return
      }
      resolve(cachePath)
    })
  })
}

// The cache otherwise grows forever (one FLAC per AIFF ever played or
// analysed, one WAV per track ever cast). Run once at startup: drops leftover .tmp files from an
// interrupted transcode, then evicts the oldest-transcoded FLACs (by mtime —
// atime isn't reliably maintained) until the cache fits within maxBytes. An
// evicted track that's played again just re-transcodes.
export function pruneMediaCache(cacheDir: string, maxBytes: number): void {
  let names: string[]
  try {
    names = readdirSync(cacheDir)
  } catch {
    return // no cache yet
  }

  const entries: { path: string; size: number; mtimeMs: number }[] = []
  for (const name of names) {
    const path = join(cacheDir, name)
    try {
      if (name.endsWith('.tmp')) {
        unlinkSync(path)
        continue
      }
      const stat = statSync(path)
      if (stat.isFile()) entries.push({ path, size: stat.size, mtimeMs: stat.mtimeMs })
    } catch {
      // vanished or unreadable — skip
    }
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0)
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const entry of entries) {
    if (total <= maxBytes) break
    try {
      unlinkSync(entry.path)
      total -= entry.size
    } catch {
      // best effort
    }
  }
}
