// Reads the playlists out of Rekordbox's XML export (File → Export
// Collection in xml format) — docs/features/playlists.md, ADR 0050. The
// file is machine-written, one element per tag, so a small tag scanner is
// enough (no XML library in the app); it can be tens of MB.

export type RekordboxNode =
  | { kind: 'folder'; name: string; children: RekordboxNode[] }
  | { kind: 'playlist'; name: string; paths: string[] }

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
        if (a.TrackID && a.Location) trackPaths.set(a.TrackID, locationToPath(a.Location))
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
        const node: RekordboxNode = { kind: 'playlist', name, paths: [] }
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
      if (path) playlist.node.paths.push(path)
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
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => (l.startsWith('file:') ? locationToPath(l) : l.normalize('NFC')))
}
