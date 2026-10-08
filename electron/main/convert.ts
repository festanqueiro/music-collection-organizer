// "Convert to…" (docs/features/convert.md, ADR 0061): a track's file
// written again in another format, bit depth or sampling frequency with the
// bundled ffmpeg. By default the converted file is a copy next to the
// original (or in a folder the user chose). With `replace`, it takes the
// track's place — same row, so tags, cues, playlists and play counts stay
// — and the original goes to the Trash.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rename, stat, unlink, mkdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseFile } from 'music-metadata'
import type { AppDatabase } from './db'
import { resolveFfmpegPath } from './ffmpegPath'
import type { AudioInfo, ConvertFormat, ConvertOptions, ConvertProgress, ConvertResult } from '../../src/types'

const EXTENSION: Record<ConvertFormat, string> = { wav: '.wav', aiff: '.aiff', flac: '.flac', alac: '.m4a', mp3: '.mp3', aac: '.m4a' }
const LOSSY: ReadonlySet<ConvertFormat> = new Set(['mp3', 'aac'])
const LOSSLESS_CODECS = new Set(['flac', 'alac', 'ape', 'wavpack', 'tta'])
// The file extensions that already are a format (AAC and Apple Lossless
// share .m4a, so those two go by the codec).
const SAME_FORMAT: Record<ConvertFormat, (ext: string, codec: string) => boolean> = {
  wav: (ext) => ext === '.wav',
  aiff: (ext) => ext === '.aiff' || ext === '.aif',
  flac: (ext) => ext === '.flac',
  alac: (_ext, codec) => codec === 'alac',
  mp3: (ext) => ext === '.mp3',
  aac: (_ext, codec) => codec === 'aac',
}

// What ffmpeg prints about a file's audio ("ffmpeg -i file", no output):
//   Stream #0:0: Audio: pcm_s24le ([1][0][0][0] / 0x0001), 44100 Hz, stereo, s32 (24 bit), 2116 kb/s
//   Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, stereo, fltp, 320 kb/s
export function parseAudioInfo(ffmpegOutput: string): AudioInfo | null {
  const line = ffmpegOutput.split('\n').find((l) => /Stream #\d+:\d+.*: Audio: /.test(l))
  if (!line) return null
  const codec = /Audio: ([^\s,]+)/.exec(line)![1]
  const rate = /(\d+) Hz/.exec(line)
  const format = /, (u8|s16|s32|s64|flt|dbl)p?(?: \((\d+) bit\))?(?:,|\s*$)/.exec(line)
  const lossless = codec.startsWith('pcm_') || LOSSLESS_CODECS.has(codec)
  const bits = format ? (format[2] ? Number(format[2]) : { u8: 8, s16: 16, s32: 32, s64: 64, flt: 32, dbl: 64 }[format[1]]!) : null
  // A lossy file has no bit depth: it's decoded to whatever is asked for.
  return { codec, lossless, bitDepth: lossless ? bits : null, sampleRate: rate ? Number(rate[1]) : null }
}

// The bit depth, bit rate and sampling frequency a conversion ends up with:
// "same as the file" keeps 16-bit files at 16 and takes anything deeper to
// 24 (32-bit and float files are what CDJs refuse); a lossy file, which has
// no depth, becomes 16-bit. MP3 and AAC stop at 48 kHz.
export function resolveTarget(
  options: Pick<ConvertOptions, 'format' | 'bitDepth' | 'bitrate' | 'sampleRate'>,
  info: AudioInfo
): { bitDepth: 16 | 24; bitrate: number; sampleRate: number | null } {
  const lossy = LOSSY.has(options.format)
  const bitDepth = options.bitDepth ?? (info.lossless && (info.bitDepth ?? 16) > 16 ? 24 : 16)
  let sampleRate = options.sampleRate
  if (lossy && (sampleRate ?? info.sampleRate ?? 0) > 48000) sampleRate = 48000
  if (sampleRate !== null && sampleRate === info.sampleRate) sampleRate = null
  return { bitDepth, bitrate: options.bitrate, sampleRate }
}

// Nothing would change: a lossless file already in that format, depth and
// frequency. (A lossy file can always be encoded again, at another bit rate.)
export function alreadyConverted(path: string, format: ConvertFormat, target: { bitDepth: number; sampleRate: number | null }, info: AudioInfo): boolean {
  if (LOSSY.has(format) || !info.lossless) return false
  return SAME_FORMAT[format](extname(path).toLowerCase(), info.codec) && info.bitDepth === target.bitDepth && target.sampleRate === null
}

// ffmpeg's arguments for one conversion. Tags are carried over
// (-map_metadata), and the cover too where the format can hold one and
// `cover` is on (the caller tries again without it if ffmpeg refuses the
// picture). Going down to 16-bit is dithered.
export function buildConvertArgs(
  input: string,
  output: string,
  format: ConvertFormat,
  target: { bitDepth: 16 | 24; bitrate: number; sampleRate: number | null },
  info: AudioInfo,
  cover: boolean
): string[] {
  const args = ['-y', '-loglevel', 'error', '-i', input, '-map', '0:a:0']
  const canHoldCover = format !== 'wav'
  if (cover && canHoldCover) args.push('-map', '0:v?', '-c:v', 'copy', '-disposition:v', 'attached_pic')
  args.push('-map_metadata', '0')
  const lossy = LOSSY.has(format)
  const dither = !lossy && target.bitDepth === 16 && info.bitDepth !== 16
  if (dither) args.push('-af', `aresample=${target.sampleRate ? `${target.sampleRate}:` : ''}osf=s16:dither_method=triangular`)
  else if (target.sampleRate) args.push('-ar', String(target.sampleRate))
  const deep = target.bitDepth === 24
  switch (format) {
    case 'wav':
      args.push('-c:a', deep ? 'pcm_s24le' : 'pcm_s16le', '-f', 'wav')
      break
    case 'aiff':
      args.push('-c:a', deep ? 'pcm_s24be' : 'pcm_s16be', '-write_id3v2', '1', '-f', 'aiff')
      break
    case 'flac':
      args.push('-c:a', 'flac', ...(deep ? ['-sample_fmt', 's32', '-bits_per_raw_sample', '24'] : ['-sample_fmt', 's16']), '-f', 'flac')
      break
    case 'alac':
      args.push('-c:a', 'alac', ...(deep ? ['-sample_fmt', 's32p', '-bits_per_raw_sample', '24'] : ['-sample_fmt', 's16p']), '-f', 'ipod')
      break
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', `${target.bitrate}k`, '-id3v2_version', '3', '-f', 'mp3')
      break
    case 'aac':
      args.push('-c:a', 'aac', '-b:a', `${target.bitrate}k`, '-f', 'ipod')
      break
  }
  args.push(output)
  return args
}

// Where the converted file goes. Replacing: the original's name with the
// new extension (the original's own path when the extension stays), and a
// different file already there is a conflict. A copy never overwrites
// anything: "Name (2).wav", "Name (3).wav"… until the name is free.
export function planOutput(
  source: string,
  folder: string | null,
  format: ConvertFormat,
  replace: boolean,
  exists: (path: string) => boolean
): { path: string; inPlace: boolean } | { conflict: string } {
  const dir = folder ?? dirname(source)
  const stem = basename(source, extname(source))
  const ext = EXTENSION[format]
  const first = join(dir, stem + ext)
  // The same file on a case-insensitive disk ("Song.WAV" → "Song.wav").
  const isSource = (path: string) => path.toLowerCase() === source.toLowerCase()
  if (replace) {
    if (isSource(first)) return { path: first, inPlace: true }
    return exists(first) ? { conflict: first } : { path: first, inPlace: false }
  }
  let path = first
  for (let n = 2; exists(path) || isSource(path); n++) path = join(dir, `${stem} (${n})${ext}`)
  return { path, inPlace: false }
}

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) return reject(new Error('ffmpeg-static did not resolve a binary path for this platform/arch'))
    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stderr }))
  })
}

// ffmpeg exits with an error when given no output, after describing the input.
export async function probeAudio(path: string): Promise<AudioInfo | null> {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', path])
  return parseAudioInfo(stderr)
}

export interface ConvertDeps {
  probe: (path: string) => Promise<AudioInfo | null>
  ffmpeg: (args: string[]) => Promise<{ code: number | null; stderr: string }>
  trash: (path: string) => Promise<void>
  // Puts the finished file under its name (fs.rename; replaced in tests).
  rename: (from: string, to: string) => Promise<void>
}

export const defaultConvertDeps = (trash: (path: string) => Promise<void>): ConvertDeps => ({ probe: probeAudio, ffmpeg: runFfmpeg, trash, rename })

const lastLine = (text: string) => text.trim().split('\n').pop()?.trim() || 'ffmpeg failed'

async function convertOne(db: AppDatabase, deps: ConvertDeps, trackId: number, options: ConvertOptions): Promise<ConvertResult> {
  const row = db.prepare('SELECT path, filename, present, cloud_status FROM tracks WHERE id = ?').get(trackId) as
    | { path: string; filename: string; present: number; cloud_status: string }
    | undefined
  if (!row) return { trackId, name: `#${trackId}`, status: 'failed', message: 'No longer in the collection' }
  const name = row.filename
  const fail = (message: string): ConvertResult => ({ trackId, name, status: 'failed', message })
  if (row.cloud_status === 'cloud_only') return fail('Not downloaded — download it first')
  if (!row.present || !existsSync(row.path)) return fail('The file is missing')
  // Taking the track's place only makes sense where the track is.
  const replace = options.replace && (options.folder === null || options.folder === dirname(row.path))
  const info = await deps.probe(row.path)
  if (!info) return fail("Couldn't read the file's audio")
  const target = resolveTarget(options, info)
  if (replace && alreadyConverted(row.path, options.format, target, info)) {
    return { trackId, name, status: 'skipped', message: 'Already in that format' }
  }
  const planned = planOutput(row.path, replace ? null : options.folder, options.format, replace, existsSync)
  if ('conflict' in planned) return fail(`${basename(planned.conflict)} is already there`)
  const out = planned.path
  await mkdir(dirname(out), { recursive: true })
  // Not an audio extension, so a scan never takes the half-written file for a track.
  const tmp = `${out}.${randomBytes(4).toString('hex')}.mcotmp`
  // Once the original is in the Trash the converted file is the only copy
  // in place: it's kept whatever goes wrong after that.
  let keepTmp = false
  try {
    let run = await deps.ffmpeg(buildConvertArgs(row.path, tmp, options.format, target, info, true))
    // A cover the format's writer refuses shouldn't stop the audio.
    if (run.code !== 0 && options.format !== 'wav') run = await deps.ffmpeg(buildConvertArgs(row.path, tmp, options.format, target, info, false))
    if (run.code !== 0) throw new Error(lastLine(run.stderr))
    if (!replace) {
      await deps.rename(tmp, out)
      return { trackId, name, status: 'converted', path: out, replaced: false }
    }
    // The row follows the file (as when a file is moved): same id, so its
    // tags, cues, playlists and analysis stay.
    const update = db.prepare('UPDATE tracks SET path = ?, filename = ?, format = ?, size = ?, mtime = ?, bitrate = ? WHERE id = ?')
    const record = async () => {
      const stats = await stat(out)
      const bitrate = await parseFile(out, { skipCovers: true, duration: false }).then((m) => m.format.bitrate ?? null, () => null)
      update.run(out, basename(out), extname(out).slice(1).toLowerCase(), stats.size, Math.floor(stats.mtimeMs), bitrate === null ? null : Math.round(bitrate), trackId)
    }
    if (planned.inPlace) {
      // Same name: the original has to leave before the new file can have it.
      await deps.trash(row.path)
      keepTmp = true
      try {
        await deps.rename(tmp, out)
      } catch (err) {
        console.error('convert: the converted file could not take the name of the original', tmp, err)
        throw new Error(`The original is in the Trash, but the converted file couldn't take its name. It's kept next to it as ${basename(tmp)}: rename it to ${basename(out)}, or restore the original`)
      }
      await record()
      return { trackId, name, status: 'converted', path: out, replaced: true }
    }
    await deps.rename(tmp, out)
    await record()
    try {
      await deps.trash(row.path)
    } catch (err) {
      console.error('convert: moving the original to the Trash failed', row.path, err)
      return { trackId, name, status: 'converted', path: out, replaced: true, message: "Converted, but the original couldn't be moved to the Trash" }
    }
    return { trackId, name, status: 'converted', path: out, replaced: true }
  } catch (err) {
    if (!keepTmp) await unlink(tmp).catch(() => {})
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// One file at a time (ffmpeg uses the cores it needs), reporting after
// each; `shouldStop` is asked between files.
export async function convertTracks(
  db: AppDatabase,
  deps: ConvertDeps,
  trackIds: number[],
  options: ConvertOptions,
  onProgress: (progress: ConvertProgress) => void = () => {},
  shouldStop: () => boolean = () => false
): Promise<ConvertResult[]> {
  const results: ConvertResult[] = []
  for (const [index, trackId] of trackIds.entries()) {
    if (shouldStop()) break
    const row = db.prepare('SELECT filename FROM tracks WHERE id = ?').get(trackId) as { filename: string } | undefined
    onProgress({ done: index, total: trackIds.length, name: row?.filename ?? '' })
    results.push(await convertOne(db, deps, trackId, options))
  }
  onProgress({ done: results.length, total: trackIds.length, name: '' })
  return results
}
