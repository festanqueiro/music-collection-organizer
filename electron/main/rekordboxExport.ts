import type { AppDatabase } from './db'
import { shortKeyName } from '../../src/state/harmonic'

// Builds a Rekordbox "DJ_PLAYLISTS" XML file (the format behind Rekordbox's
// File → Import / "rekordbox xml" library view). One-way: Rekordbox reads
// it, MCO never reads it back, so neither library can be damaged.
//
// COLLECTION holds every present, locally available track with the
// metadata MCO knows (BPM, key, genre tag, duration…). PLAYLISTS turns
// MCO's own tags into a folder tree under "MCO":
//   - a genre with no sub-genres        → one playlist
//   - a genre with sub-genres           → a folder holding "<genre> (all)"
//                                         plus one playlist per sub-genre
// No beat grids or cue points are written — Rekordbox analyses those
// itself on import.

interface ExportTrackRow {
  id: number
  path: string
  filename: string
  format: string
  size: number
  birthtime: number | null
  duration: number | null
  bitrate: number | null
  title: string | null
  artist: string | null
  album: string | null
  genre_tag: string | null
  year: number | null
  bpm: number | null
  musical_key: string | null
}

export interface RekordboxExportResult {
  xml: string
  trackCount: number
  playlistCount: number
}

const KIND_BY_FORMAT: Record<string, string> = {
  mp3: 'MP3 File',
  wav: 'WAV File',
  aif: 'AIFF File',
  aiff: 'AIFF File',
  flac: 'FLAC File',
  m4a: 'M4A File',
  aac: 'AAC File',
  ogg: 'OGG File',
  opus: 'OPUS File',
}

// Attribute values: escape markup characters and drop control characters
// XML 1.0 can't represent at all (they do turn up in badly tagged files).
export function xmlAttr(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Rekordbox expects "file://localhost" + the absolute path with each
// segment percent-encoded (spaces as %20, "#" and "?" escaped too).
export function toRekordboxLocation(absolutePath: string): string {
  return 'file://localhost' + absolutePath.split('/').map(encodeURIComponent).join('/')
}

function formatDate(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

export function buildRekordboxXml(db: AppDatabase, appVersion: string): RekordboxExportResult {
  const tracks = db
    .prepare(
      `SELECT id, path, filename, format, size, birthtime, duration, bitrate, title, artist, album, genre_tag, year, bpm, musical_key
       FROM tracks WHERE present = 1 AND cloud_status = 'local' ORDER BY id`
    )
    .all() as unknown as ExportTrackRow[]
  const exportedIds = new Set(tracks.map((t) => t.id))

  const genres = db.prepare('SELECT id, name FROM genres ORDER BY name COLLATE NOCASE').all() as {
    id: number
    name: string
  }[]
  const subgenres = db.prepare('SELECT id, name, genre_id FROM subgenres ORDER BY name COLLATE NOCASE').all() as {
    id: number
    name: string
    genre_id: number
  }[]
  const trackIdsByGenre = groupIds(
    db.prepare('SELECT genre_id AS tag_id, track_id FROM track_genres ORDER BY track_id').all() as unknown as TagRow[],
    exportedIds
  )
  const trackIdsBySubgenre = groupIds(
    db.prepare('SELECT subgenre_id AS tag_id, track_id FROM track_subgenres ORDER BY track_id').all() as unknown as TagRow[],
    exportedIds
  )

  // Tag names per track, for the Comments field — handy for searching in
  // Rekordbox, where the playlists are the only other trace of MCO's tags.
  const tagNamesByTrack = new Map<number, string[]>()
  const addName = (trackId: number, name: string) => {
    const list = tagNamesByTrack.get(trackId) ?? []
    list.push(name)
    tagNamesByTrack.set(trackId, list)
  }
  for (const g of genres) for (const id of trackIdsByGenre.get(g.id) ?? []) addName(id, g.name)
  for (const sg of subgenres) for (const id of trackIdsBySubgenre.get(sg.id) ?? []) addName(id, sg.name)

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<DJ_PLAYLISTS Version="1.0.0">')
  lines.push(`  <PRODUCT Name="MCO - Music Collection Organizer" Version="${xmlAttr(appVersion)}" Company=""/>`)
  lines.push(`  <COLLECTION Entries="${tracks.length}">`)
  for (const t of tracks) {
    const attrs: [string, string | number | null][] = [
      ['TrackID', t.id],
      ['Name', t.title ?? t.filename.replace(/\.[^.]+$/, '')],
      ['Artist', t.artist],
      ['Album', t.album],
      ['Genre', t.genre_tag],
      ['Kind', KIND_BY_FORMAT[t.format] ?? `${t.format.toUpperCase()} File`],
      ['Size', t.size],
      ['TotalTime', t.duration ? Math.round(t.duration) : null],
      ['BitRate', t.bitrate],
      ['Year', t.year],
      ['AverageBpm', t.bpm ? t.bpm.toFixed(2) : null],
      ['DateAdded', formatDate(t.birthtime)],
      ['Tonality', shortKeyName(t.musical_key)],
      ['Comments', tagNamesByTrack.has(t.id) ? tagNamesByTrack.get(t.id)!.sort().join(', ') : null],
      ['Location', toRekordboxLocation(t.path)],
    ]
    const rendered = attrs
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}="${xmlAttr(v)}"`)
      .join(' ')
    lines.push(`    <TRACK ${rendered}/>`)
  }
  lines.push('  </COLLECTION>')

  // Playlist tree. Type="0" is a folder (Count = children), Type="1" a
  // playlist (KeyType="0" = entries reference COLLECTION TrackIDs).
  let playlistCount = 0
  const playlist = (name: string, ids: number[], indent: string): string[] => {
    playlistCount++
    return [
      `${indent}<NODE Name="${xmlAttr(name)}" Type="1" KeyType="0" Entries="${ids.length}">`,
      ...ids.map((id) => `${indent}  <TRACK Key="${id}"/>`),
      `${indent}</NODE>`,
    ]
  }

  const genreNodes: string[][] = []
  for (const g of genres) {
    const children = subgenres.filter((sg) => sg.genre_id === g.id)
    const genreIds = trackIdsByGenre.get(g.id) ?? []
    if (children.length === 0) {
      genreNodes.push(playlist(g.name, genreIds, '        '))
      continue
    }
    genreNodes.push([
      `        <NODE Type="0" Name="${xmlAttr(g.name)}" Count="${children.length + 1}">`,
      ...playlist(`${g.name} (all)`, genreIds, '          '),
      ...children.flatMap((sg) => playlist(sg.name, trackIdsBySubgenre.get(sg.id) ?? [], '          ')),
      '        </NODE>',
    ])
  }

  lines.push('  <PLAYLISTS>')
  lines.push('    <NODE Type="0" Name="ROOT" Count="1">')
  lines.push(`      <NODE Type="0" Name="MCO" Count="${genreNodes.length}">`)
  for (const node of genreNodes) lines.push(...node)
  lines.push('      </NODE>')
  lines.push('    </NODE>')
  lines.push('  </PLAYLISTS>')
  lines.push('</DJ_PLAYLISTS>')

  return { xml: lines.join('\n') + '\n', trackCount: tracks.length, playlistCount }
}

interface TagRow {
  tag_id: number
  track_id: number
}

function groupIds(rows: TagRow[], keep: Set<number>): Map<number, number[]> {
  const byTag = new Map<number, number[]>()
  for (const row of rows) {
    if (!keep.has(row.track_id)) continue
    const list = byTag.get(row.tag_id) ?? []
    list.push(row.track_id)
    byTag.set(row.tag_id, list)
  }
  return byTag
}
