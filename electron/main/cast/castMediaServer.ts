// Direct mode's file server: the cast device fetches the track itself
// (and its artwork, for the device's now-playing screen) from here over
// the LAN, with Range support so it can seek. Only tracks MCO resolves
// (by id, from its own database, inside the collection folder) are ever
// served, under an unguessable per-session path prefix.
import { createServer, type Server, type ServerResponse } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { parseRangeHeader } from '../rangeHeader'

export interface ServedTrack {
  filePath: string // already playable (AIFF transcoded)
  contentType: string
}

export interface ServedImage {
  data: Buffer
  contentType: string
}

export interface MediaResolvers {
  track: (trackId: number) => Promise<ServedTrack | null>
  artwork: (trackId: number) => Promise<ServedImage | null>
}

// Parses `/<token>/<kind>/<id>` — null for anything else.
export function parseMediaPath(pathname: string, token: string): { kind: 'track' | 'art'; trackId: number } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== token) return null
  const [, kind, id] = parts
  if (kind !== 'track' && kind !== 'art') return null
  if (!/^\d+$/.test(id)) return null
  return { kind, trackId: Number(id) }
}

export class CastMediaServer {
  private server: Server | null = null
  private readonly token = randomBytes(16).toString('hex')

  constructor(private readonly resolve: MediaResolvers) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const route = parseMediaPath(new URL(req.url ?? '/', 'http://localhost').pathname, this.token)
      if (!route) {
        res.writeHead(404).end()
        return
      }
      res.on('finish', () => {
        if (res.statusCode >= 400) console.error('cast media server:', req.method, route.kind, route.trackId, req.headers.range ?? '', '→', res.statusCode)
      })
      const handler = route.kind === 'track' ? this.serveTrack(route.trackId, req.headers.range, req.method, res) : this.serveArt(route.trackId, req.method, res)
      handler.catch((err) => {
        console.error('cast media server', err)
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '0.0.0.0', () => resolve())
    })
  }

  url(localAddress: string, kind: 'track' | 'art', trackId: number): string {
    const address = this.server?.address()
    const port = typeof address === 'object' && address ? address.port : 0
    return `http://${localAddress}:${port}/${this.token}/${kind}/${trackId}`
  }

  stop(): void {
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = null
  }

  private async serveTrack(trackId: number, rangeHeader: string | undefined, method: string | undefined, res: ServerResponse): Promise<void> {
    const track = await this.resolve.track(trackId)
    if (!track) {
      res.writeHead(404).end()
      return
    }
    const size = statSync(track.filePath).size
    const common = {
      'Content-Type': track.contentType,
      'Accept-Ranges': 'bytes',
      // Cast receivers fetch media from their own origin.
      'Access-Control-Allow-Origin': '*',
    }
    const range = rangeHeader ? parseRangeHeader(rangeHeader, size) : null
    if (rangeHeader && !range) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
      return
    }
    if (range) {
      res.writeHead(206, {
        ...common,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1),
      })
    } else {
      res.writeHead(200, { ...common, 'Content-Length': String(size) })
    }
    if (method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(track.filePath, range ? { start: range.start, end: range.end } : {}).pipe(res)
  }

  private async serveArt(trackId: number, method: string | undefined, res: ServerResponse): Promise<void> {
    const image = await this.resolve.artwork(trackId)
    if (!image) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.length),
      'Access-Control-Allow-Origin': '*',
    })
    res.end(method === 'HEAD' ? undefined : image.data)
  }
}
