import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

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

    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static did not resolve a binary path for this platform/arch'))
      return
    }

    mkdirSync(cacheDir, { recursive: true })
    // Transcode to a .tmp path and rename into place once ffmpeg exits
    // successfully — a concurrent request for the same track (e.g. a fast
    // seek right after playback starts) must never see a half-written file.
    // The tmp path ends in .tmp, not .flac, so ffmpeg can't infer the muxer
    // from the output filename the way it could for the final cachePath —
    // -f flac makes that explicit.
    const tmpPath = `${cachePath}.tmp`
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
      renameSync(tmpPath, cachePath)
      resolve(cachePath)
    })
  })
}
