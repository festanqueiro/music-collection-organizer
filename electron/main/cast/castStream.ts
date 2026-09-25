// The live stream a cast session plays. The renderer records MCO's own
// output with MediaRecorder and pushes WebM chunks here; ffmpeg
// re-encodes them, and a small HTTP server exposes the result on the LAN
// for the device to pull:
//   video — a rolling HLS playlist (H.264 + AAC in MPEG-TS, the most
//           widely supported live format on Cast TVs) in a temp folder;
//   audio — for speakers without a screen, one endless MP3 response,
//           the way internet radio streams, which every Cast speaker plays.
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, readdirSync, createReadStream, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir, networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import { randomBytes } from 'node:crypto'
import { resolveFfmpegPath } from '../ffmpegPath'

export type CastStreamKind = 'video' | 'audio'

const PLAYLIST_NAME = 'live.m3u8'
const AUDIO_NAME = 'live.mp3'
// HLS segment length. The TV buffers about three segments behind the live
// edge, so this sets most of the delay (~6-10s); shorter segments cut it
// but leave the TV less buffered to ride out Wi-Fi hiccups.
const SEGMENT_SECONDS = 2
const SEGMENTS_IN_PLAYLIST = 6
// The device starts playing a little behind the live edge, so there's no
// point loading it before there's something to buffer: two HLS segments,
// or about a second of MP3.
const SEGMENTS_BEFORE_READY = 2
const AUDIO_BYTES_BEFORE_READY = 40_000

const INPUT_ARGS = ['-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-f', 'matroska', '-i', 'pipe:0']

export function buildFfmpegArgs(kind: CastStreamKind, outputDir: string): string[] {
  if (kind === 'audio') {
    return [...INPUT_ARGS, '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-flush_packets', '1', '-f', 'mp3', 'pipe:1']
  }
  return [
    ...INPUT_ARGS,
    '-map', '0:v:0',
    '-map', '0:a:0',
    // Hardware encoder — cheap enough to run alongside the visualizer.
    // A keyframe at every segment boundary is required for HLS to cut
    // segments evenly.
    '-c:v', 'h264_videotoolbox',
    '-realtime', '1',
    '-b:v', '5000k',
    '-maxrate', '6000k',
    '-bufsize', '6000k',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-vf', 'fps=30',
    '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-c:a', 'aac',
    '-b:a', '256k',
    '-ar', '48000',
    '-ac', '2',
    // Canvas capture and the audio clock can drift a little apart over a
    // long session; this keeps audio locked to its timestamps.
    '-af', 'aresample=async=1000',
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_list_size', String(SEGMENTS_IN_PLAYLIST),
    '-hls_flags', 'delete_segments+independent_segments+omit_endlist',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', join(outputDir, 'seg%06d.ts'),
    join(outputDir, PLAYLIST_NAME),
  ]
}

// The address the device should use to reach this Mac: the IPv4 address
// on the same subnet as the device, falling back to the first
// non-internal IPv4 address (e.g. when the TV sits behind a separate
// access point).
export function pickLocalAddress(
  deviceHost: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string | null {
  const candidates = Object.values(interfaces)
    .flat()
    .filter((i): i is NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
  const toInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
  const device = toInt(deviceHost)
  const sameSubnet = candidates.find((i) => {
    const mask = toInt(i.netmask)
    return (toInt(i.address) & mask) === (device & mask)
  })
  return (sameSubnet ?? candidates[0])?.address ?? null
}

const HLS_CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
}

export class CastStream {
  private ffmpeg: ChildProcess | null = null
  private server: Server | null = null
  private readonly dir: string
  // Unguessable path prefix — the server listens on the LAN, and should
  // only ever serve this session's stream to whoever was given the URL.
  private readonly token = randomBytes(16).toString('hex')
  private stopped = false
  private stderr = ''
  private audioBytes = 0
  private audioListeners = new Set<ServerResponse>()
  // When the device last (re)connected to the MP3 stream.
  private audioListenerSince: number | null = null

  constructor(
    readonly kind: CastStreamKind,
    private readonly onFailure: (message: string) => void,
  ) {
    this.dir = mkdtempSync(join(tmpdir(), 'mco-cast-'))
  }

  get contentType(): string {
    return this.kind === 'audio' ? 'audio/mpeg' : 'application/x-mpegurl'
  }

  async start(): Promise<void> {
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) throw new Error('ffmpeg is not available')
    const ffmpeg = spawn(ffmpegPath, buildFfmpegArgs(this.kind, this.dir), {
      stdio: ['pipe', this.kind === 'audio' ? 'pipe' : 'ignore', 'pipe'],
    })
    this.ffmpeg = ffmpeg
    ffmpeg.stdout?.on('data', (data: Buffer) => {
      this.audioBytes += data.length
      for (const res of this.audioListeners) res.write(data)
    })
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      this.stderr = (this.stderr + data.toString()).slice(-2000)
    })
    ffmpeg.stdin?.on('error', () => {
      // EPIPE after ffmpeg exits — reported by the 'exit' handler instead.
    })
    ffmpeg.on('error', (err) => this.fail(`Couldn't start the stream encoder: ${err.message}`))
    ffmpeg.on('exit', (code) => {
      if (!this.stopped) this.fail(`The stream encoder stopped (${code ?? 'killed'}): ${this.stderr.trim().split('\n').pop() ?? ''}`)
    })

    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const [token, name, ...rest] = url.pathname.split('/').filter(Boolean)
      if (token !== this.token || !name || rest.length > 0) {
        res.writeHead(404).end()
        return
      }
      if (this.kind === 'audio') this.serveAudio(name, req.method, res)
      else this.serveHlsFile(name, req.method, res)
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '0.0.0.0', () => resolve())
    })
  }

  write(chunk: Uint8Array): void {
    if (this.stopped || !this.ffmpeg?.stdin?.writable) return
    this.ffmpeg.stdin.write(chunk)
  }

  isReady(): boolean {
    if (this.kind === 'audio') return this.audioBytes >= AUDIO_BYTES_BEFORE_READY
    try {
      return readdirSync(this.dir).filter((f) => f.endsWith('.ts')).length >= SEGMENTS_BEFORE_READY
    } catch {
      return false
    }
  }

  // Seconds since the newest HLS segment was published (the playlist is
  // rewritten each time one is), or since the device started listening to
  // the MP3 stream — what castDelay.ts measures the device's delay from.
  publishedAgeSeconds(): number | null {
    if (this.kind === 'audio') return null
    try {
      return (Date.now() - statSync(join(this.dir, PLAYLIST_NAME)).mtimeMs) / 1000
    } catch {
      return null
    }
  }

  listeningSeconds(): number | null {
    return this.audioListenerSince === null ? null : (Date.now() - this.audioListenerSince) / 1000
  }

  url(localAddress: string): string {
    const address = this.server?.address()
    const port = typeof address === 'object' && address ? address.port : 0
    return `http://${localAddress}:${port}/${this.token}/${this.kind === 'audio' ? AUDIO_NAME : PLAYLIST_NAME}`
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.ffmpeg?.stdin?.end()
    this.ffmpeg?.kill('SIGKILL')
    this.ffmpeg = null
    for (const res of this.audioListeners) res.end()
    this.audioListeners.clear()
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = null
    rmSync(this.dir, { recursive: true, force: true })
  }

  // basename() + an extension allowlist: only files ffmpeg wrote into this
  // session's folder are ever served.
  private serveHlsFile(name: string, method: string | undefined, res: ServerResponse): void {
    const ext = name.slice(name.lastIndexOf('.'))
    if (basename(name) !== name || !HLS_CONTENT_TYPES[ext]) {
      res.writeHead(404).end()
      return
    }
    const filePath = join(this.dir, name)
    let size: number
    try {
      size = statSync(filePath).size
    } catch {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': HLS_CONTENT_TYPES[ext],
      'Content-Length': String(size),
      // Cast receivers fetch HLS with XHR from their own origin.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    })
    if (method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  }

  // Joins the listener to the live MP3 from wherever it is now — MP3
  // frames are self-synchronising, so starting mid-stream is fine.
  private serveAudio(name: string, method: string | undefined, res: ServerResponse): void {
    if (name !== AUDIO_NAME) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    })
    if (method === 'HEAD') {
      res.end()
      return
    }
    this.audioListeners.add(res)
    this.audioListenerSince = Date.now()
    res.on('close', () => this.audioListeners.delete(res))
  }

  private fail(message: string): void {
    if (this.stopped) return
    this.stop()
    this.onFailure(message)
  }
}
