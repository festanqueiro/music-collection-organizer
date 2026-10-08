// Reads the playlists out of Rekordbox's XML export (File → Export
// Collection in xml format) — docs/features/playlists.md, ADR 0050. The
// file is machine-written, one element per tag, so a small tag scanner is
// enough (no XML library in the app); it can be tens of MB.

// What an export says about a song besides its path, for finding it in the
// collection when the path is wrong (an old USB stick's): any may be missing.
export interface SongHint {
  size?: number
  duration?: number
  title?: string
  artist?: string
}

// `hints`, when present, runs parallel to `paths`.
export type RekordboxNode =
  | { kind: 'folder'; name: string; children: RekordboxNode[] }
  | { kind: 'playlist'; name: string; paths: string[]; hints?: SongHint[] }

// Every playlist and folder with its name path, parents before children; a
// repeated name among siblings gets " (2)", " (3)"… so each path is unique.
// The import and the comparison both know a Rekordbox playlist by this path.
export function flattenRekordboxTree(nodes: RekordboxNode[], parent: string[] = []): { node: RekordboxNode; path: string[] }[] {
  const out: { node: RekordboxNode; path: string[] }[] = []
  const seen = new Map<string, number>()
  for (const node of nodes) {
    const key = `${node.kind}:${node.name}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const path = [...parent, n > 1 ? `${node.name} (${n})` : node.name]
    out.push({ node, path })
    if (node.kind === 'folder') out.push(...flattenRekordboxTree(node.children, path))
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code] ?? whole
  })
}

function attributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of text.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '')
  return attrs
}

// "file://localhost/Users/me/Music/A%20B.aiff" → "/Users/me/Music/A B.aiff";
// a Windows drive ("file://localhost/C:/Music/a.mp3") → "C:\Music\a.mp3".
export function locationToPath(location: string): string {
  let rest = location.replace(/^file:\/\/(localhost)?/i, '')
  try {
    rest = decodeURIComponent(rest)
  } catch {
    // A stray "%" — keep it as written.
  }
  if (/^\/[A-Za-z]:\//.test(rest)) rest = rest.slice(1).replace(/\//g, '\\')
  return rest.normalize('NFC')
}

// The playlist tree under PLAYLISTS' ROOT node, songs as file paths.
export function parseRekordboxXml(xml: string): RekordboxNode[] {
  if (!/<DJ_PLAYLISTS[\s>]/.test(xml)) throw new Error("This isn't a Rekordbox XML export")
  const trackPaths = new Map<string, string>()
  const trackHints = new Map<string, SongHint>()
  const stack: { kind: 'folder'; name: string; children: RekordboxNode[] }[] = []
  let root: RekordboxNode[] | null = null
  let inPlaylists = false
  let playlist: { node: Extract<RekordboxNode, { kind: 'playlist' }>; keyType: string } | null = null
  // COLLECTION's TRACK elements can have children (TEMPO, POSITION_MARK).
  for (const m of xml.matchAll(/<(\/?)([A-Z_]+)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrText, selfClosing] = m
    if (tag === 'PLAYLISTS') {
      inPlaylists = !closing
      continue
    }
    if (!inPlaylists) {
      if (tag === 'TRACK' && !closing) {
        const a = attributes(attrText)
        if (a.TrackID && a.Location) {
          trackPaths.set(a.TrackID, locationToPath(a.Location))
          const number = (v: string | undefined) => (v && Number(v) > 0 ? Number(v) : undefined)
          trackHints.set(a.TrackID, {
            size: number(a.Size),
            duration: number(a.TotalTime),
            title: a.Name || undefined,
            artist: a.Artist || undefined,
          })
        }
      }
      continue
    }
    if (tag === 'NODE') {
      if (closing) {
        if (playlist) playlist = null
        else {
          const done = stack.pop()
          if (done && stack.length === 0) root = done.children
        }
        continue
      }
      const a = attributes(attrText)
      const name = a.Name ?? ''
      if (a.Type === '1') {
        const node: RekordboxNode = { kind: 'playlist', name, paths: [], hints: [] }
        stack[stack.length - 1]?.children.push(node)
        if (!selfClosing) playlist = { node, keyType: a.KeyType ?? '0' }
      } else {
        const folder = { kind: 'folder' as const, name, children: [] as RekordboxNode[] }
        stack[stack.length - 1]?.children.push(folder)
        if (selfClosing) {
          if (stack.length === 0) root = []
        } else stack.push(folder)
      }
      continue
    }
    if (tag === 'TRACK' && playlist && !closing) {
      const key = attributes(attrText).Key
      const path = playlist.keyType === '1' ? (key ? locationToPath(key) : undefined) : trackPaths.get(key ?? '')
      if (path) {
        playlist.node.paths.push(path)
        playlist.node.hints!.push((playlist.keyType === '1' ? undefined : trackHints.get(key ?? '')) ?? {})
      }
    }
  }
  return root ?? []
}

// A single playlist exported as text (right-click a playlist → Export a
// playlist to a file → .txt): UTF-16, tab-separated, one header row with
// the columns shown in Rekordbox. It has no file paths unless a Location
// column was shown, so songs are matched by title and artist.
export interface RekordboxTxtRow {
  title: string
  artist: string
  path?: string
}

export function decodeRekordboxText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le')
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le')
  return buffer.toString('utf8').replace(/^\uFEFF/, '')
}

export function parseRekordboxTxt(text: string): RekordboxTxtRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = (lines.shift() ?? '').split('\t').map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h))
  const title = col('track title', 'title')
  const artist = col('artist')
  const location = col('location', 'file path')
  if (title < 0 && location < 0) throw new Error("This isn't a Rekordbox playlist export (no Track Title column)")
  return lines.map((line) => {
    const cells = line.split('\t')
    const path = location >= 0 ? cells[location]?.trim() : undefined
    return {
      title: title >= 0 ? (cells[title] ?? '').trim() : '',
      artist: artist >= 0 ? (cells[artist] ?? '').trim() : '',
      path: path ? (path.startsWith('file:') ? locationToPath(path) : path.normalize('NFC')) : undefined,
    }
  })
}

// A playlist exported as .m3u8/.m3u: "#" lines are comments, every other
// line a song's file path (or a file:// URL).
export function parseM3u(text: string): string[] {
  return parseM3uEntries(text).map((e) => e.path)
}

// The same, with what each song's "#EXTINF:<seconds>,<Artist> - <Title>"
// line says about it.
export function parseM3uEntries(text: string): { path: string; hint: SongHint }[] {
  const entries: { path: string; hint: SongHint }[] = []
  let hint: SongHint = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const info = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)\s*,(.*)$/i.exec(line)
    if (info) {
      const seconds = Number(info[1])
      const label = info[2].trim()
      const dash = label.indexOf(' - ')
      hint = {
        duration: seconds > 0 ? seconds : undefined,
        artist: dash > 0 ? label.slice(0, dash).trim() : undefined,
        title: (dash > 0 ? label.slice(dash + 3) : label).trim() || undefined,
      }
      continue
    }
    if (line.startsWith('#')) continue
    entries.push({ path: line.startsWith('file:') ? locationToPath(line) : line.normalize('NFC'), hint })
    hint = {}
  }
  return entries
}

// ---- The whole collection, for comparing with MCO (Rekordbox sync, phase 1) ----

export interface RekordboxCue {
  // 0–7 = hot cue A–H; -1 = memory cue or loop.
  num: number
  // 0 cue, 4 loop (Rekordbox's Type).
  type: number
  start: number
  end?: number
  color: [number, number, number] | null
}

export interface RekordboxTrack {
  trackId: string
  path: string
  name: string
  artist: string
  album: string
  genre: string
  comments: string
  year: number | null
  bpm: number | null
  tonality: string
  seconds: number | null
  cues: RekordboxCue[]
}

export interface RekordboxCollection {
  version: string | null
  tracks: RekordboxTrack[]
  tree: RekordboxNode[]
}

// COLLECTION's tracks with their fields and cue marks, plus the playlist tree.
export function readRekordboxCollection(xml: string): RekordboxCollection {
  const tree = parseRekordboxXml(xml)
  const product = /<PRODUCT\b([^>]*)>/.exec(xml)
  const version = product ? (attributes(product[1]).Version ?? null) : null
  const start = xml.indexOf('<COLLECTION')
  const end = xml.indexOf('</COLLECTION>')
  const tracks: RekordboxTrack[] = []
  if (start >= 0 && end > start) {
    const body = xml.slice(start, end)
    const num = (v: string | undefined) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
    for (const m of body.matchAll(/<TRACK\b([^>]*?)(\/>|>([\s\S]*?)<\/TRACK>)/g)) {
      const a = attributes(m[1])
      if (!a.TrackID || !a.Location) continue
      const cues = [...(m[3] ?? '').matchAll(/<POSITION_MARK\b([^>]*?)\/?>/g)].map((p): RekordboxCue => {
        const c = attributes(p[1])
        const rgb = c.Red !== undefined ? ([Number(c.Red), Number(c.Green ?? 0), Number(c.Blue ?? 0)] as [number, number, number]) : null
        return {
          num: Number(c.Num ?? -1),
          type: Number(c.Type ?? 0),
          start: Number(c.Start ?? 0),
          ...(c.End !== undefined ? { end: Number(c.End) } : {}),
          color: rgb,
        }
      })
      const year = num(a.Year)
      const bpm = num(a.AverageBpm)
      tracks.push({
        trackId: a.TrackID,
        path: locationToPath(a.Location),
        name: a.Name ?? '',
        artist: a.Artist ?? '',
        album: a.Album ?? '',
        genre: a.Genre ?? '',
        comments: a.Comments ?? '',
        year: year && year > 0 ? year : null,
        bpm: bpm && bpm > 0 ? bpm : null,
        tonality: a.Tonality ?? '',
        seconds: num(a.TotalTime),
        cues,
      })
    }
  }
  return { version, tracks, tree }
}
