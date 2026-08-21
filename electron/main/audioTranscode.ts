import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
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

function cacheKeyFor(filePath: string, mtimeMs: number): string {
  return createHash('sha256').update(`${filePath}:${mtimeMs}`).digest('hex')
}

// Returns a path Chromium's <audio> element can actually play. Non-AIFF
// files pass through unchanged. AIFF files are transcoded once to FLAC
// (lossless, and natively playable) into cacheDir, keyed by the source
// file's path + mtime so an edited/replaced file re-transcodes rather than
// serving a stale cached version — repeat playback/seeking of the same
// track then just reuses the cached file instead of re-invoking ffmpeg.
export function getPlayableFilePath(filePath: string, cacheDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!needsTranscode(filePath)) {
      resolve(filePath)
      return
    }

    let mtimeMs: number
    try {
      mtimeMs = statSync(filePath).mtimeMs
    } catch (err) {
      reject(err)
      return
    }

    const cachePath = join(cacheDir, `${cacheKeyFor(filePath, mtimeMs)}.flac`)
    if (existsSync(cachePath)) {
      resolve(cachePath)
      return
    }

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
    const proc = spawn(ffmpegPath, ['-y', '-i', filePath, '-f', 'flac', '-loglevel', 'error', tmpPath])

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
