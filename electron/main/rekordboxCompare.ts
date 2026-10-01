// Rekordbox sync, phase 1 (docs/features/rekordbox-sync.md, ADR 0052): what
// differs between Rekordbox's collection export and MCO, as findings in
// four groups — playlists, music info, cue points, files. Read-only: this
// builds the report; applying anything comes in later phases. Without a
// snapshot of a previous sync yet, it's a plain two-sided comparison (the
// spec's "first sync").
import { existsSync } from 'node:fs'
import type { AppDatabase } from './db'
import { getPlaylistNodes, getPlaylistTrackIds, trackMatcher } from './playlists'
import type { RekordboxCollection, RekordboxCue, RekordboxNode, RekordboxTrack } from './rekordboxXml'
import type { RekordboxCueMark, RekordboxInfoField, RekordboxReport } from '../../src/types'
import { toCamelot } from '../../src/state/harmonic'

// How many example rows each group carries to the window (counts are full).
const ROWS = 400

export interface McoTrack {
  id: number
  path: string
  filename: string
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  bpm: number | null
  musicalKey: string | null
  present: boolean
  // Tags then Subtags, as the genre text MCO would write.
  tags: string[]
}

export interface McoPlaylist {
  id: number
  // Name path from the top, without MCO's "Rekordbox" import folder.
  path: string[]
  source: 'mco' | 'rekordbox'
  // For imported ones, their path in Rekordbox's tree (JSON array).
  sourcePath: string | null
  trackIds: number[]
}

export interface McoSide {
  collectionFolder: string | null
  tracks: McoTrack[]
  playlists: McoPlaylist[]
  // A Rekordbox path → MCO track id (by path, ignoring case, or confirmed earlier).
  match: (path: string) => number | undefined
}

const clean = (s: string | null | undefined) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
const stem = (filename: string) => filename.replace(/\.[^.]+$/, '')
const songLabel = (t: { artist: string | null; title: string | null; filename: string }) =>
  t.title ? (t.artist ? `${t.artist} – ${t.title}` : t.title) : t.filename
const genreNames = (text: string) =>
  text
    .split(/\s*[,/;]\s*/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|')

// Keys in any notation ("Fm", "F minor", "4A") to a Camelot code.
function keyCode(value: string | null): string | null {
  if (!value) return null
  const camelot = /^\s*(\d{1,2})\s*([AB])\s*$/i.exec(value)
  if (camelot) return `${Number(camelot[1])}${camelot[2].toUpperCase()}`
  return toCamelot(value)?.code ?? null
}

// Tempos that are the same, half or double within half a BPM — two
// analysers rarely agree to the decimal.
function sameTempo(a: number, b: number): boolean {
  return [1, 2, 0.5].some((f) => Math.abs(a - b * f) <= 0.5)
}

function cueMark(c: RekordboxCue): RekordboxCueMark {
  const hex = c.color ? '#' + c.color.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('') : null
  return {
    slot: c.num,
    kind: c.type === 4 ? 'loop' : c.num >= 0 ? 'hot' : 'memory',
    start: c.start,
    ...(c.end !== undefined ? { end: c.end } : {}),
    color: hex,
  }
}

function flatten(nodes: RekordboxNode[], parent: string[] = []): { path: string[]; paths: string[] }[] {
  const out: { path: string[]; paths: string[] }[] = []
  const seen = new Map<string, number>()
  for (const node of nodes) {
    const key = `${node.kind}:${node.name}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const path = [...parent, n > 1 ? `${node.name} (${n})` : node.name]
    if (node.kind === 'playlist') out.push({ path, paths: node.paths })
    else out.push(...flatten(node.children, path))
  }
  return out
}

export function compareWithRekordbox(
  file: string,
  rb: RekordboxCollection,
  mco: McoSide,
  fileExists: (path: string) => boolean = existsSync
): RekordboxReport {
  const byId = new Map(mco.tracks.map((t) => [t.id, t]))
  const label = (id: number) => {
    const t = byId.get(id)
    return t ? songLabel(t) : `#${id}`
  }

  // ---- songs and files ----
  const pairs: { rb: RekordboxTrack; mco: McoTrack }[] = []
  const seenMco = new Set<number>()
  const files: Record<RekordboxReport['files'][number]['kind'], { path: string; song: string }[]> = {
    'outside-collection': [],
    'not-scanned': [],
    'gone-from-disk': [],
    'only-in-mco': [],
    'missing-in-mco': [],
  }
  const folder = mco.collectionFolder ? mco.collectionFolder.normalize('NFC').replace(/[\\/]+$/, '') : null
  const inCollection = (p: string) => !!folder && (p.normalize('NFC') + '/').startsWith(folder + '/')
  for (const t of rb.tracks) {
    const id = mco.match(t.path)
    const song = t.name ? (t.artist ? `${t.artist} – ${t.name}` : t.name) : t.path.split(/[\\/]/).pop()!
    if (id === undefined || !byId.has(id)) {
      if (!fileExists(t.path)) files['gone-from-disk'].push({ path: t.path, song })
      else if (inCollection(t.path)) files['not-scanned'].push({ path: t.path, song })
      else files['outside-collection'].push({ path: t.path, song })
      continue
    }
    const m = byId.get(id)!
    seenMco.add(id)
    if (!m.present) files['missing-in-mco'].push({ path: m.path, song })
    pairs.push({ rb: t, mco: m })
  }
  for (const t of mco.tracks) if (t.present && !seenMco.has(t.id)) files['only-in-mco'].push({ path: t.path, song: songLabel(t) })

  // ---- music info ----
  const info = new Map<RekordboxInfoField, { trackId: number; song: string; rekordbox: string; mco: string }[]>()
  const differ = (field: RekordboxInfoField, m: McoTrack, rbValue: string, mcoValue: string) => {
    const rows = info.get(field) ?? []
    rows.push({ trackId: m.id, song: songLabel(m), rekordbox: rbValue || '—', mco: mcoValue || '—' })
    info.set(field, rows)
  }
  for (const { rb: r, mco: m } of pairs) {
    // Rekordbox shows the file name when a song has no title tag.
    const mcoTitle = clean(m.title) || clean(stem(m.filename))
    if (clean(r.name) !== mcoTitle) differ('title', m, clean(r.name), clean(m.title))
    if (clean(r.artist) !== clean(m.artist)) differ('artist', m, clean(r.artist), clean(m.artist))
    if (clean(r.album) !== clean(m.album)) differ('album', m, clean(r.album), clean(m.album))
    if ((r.year ?? null) !== (m.year ?? null)) differ('year', m, r.year ? String(r.year) : '', m.year ? String(m.year) : '')
    if (genreNames(r.genre) !== genreNames(m.tags.join(', '))) differ('genre', m, clean(r.genre), m.tags.join(', '))
    if (r.bpm && m.bpm && !sameTempo(r.bpm, m.bpm)) differ('bpm', m, r.bpm.toFixed(2), m.bpm.toFixed(2))
    const rk = keyCode(r.tonality)
    const mk = keyCode(m.musicalKey)
    if (rk && mk && rk !== mk) differ('key', m, `${r.tonality} (${rk})`, `${m.musicalKey} (${mk})`)
  }
  const FIELDS: RekordboxInfoField[] = ['title', 'artist', 'album', 'year', 'genre', 'bpm', 'key']

  // ---- cue points (MCO keeps none yet: all of Rekordbox's are "only in Rekordbox") ----
  const cueRows = pairs
    .filter((p) => p.rb.cues.length > 0)
    .map((p) => ({ trackId: p.mco.id, song: songLabel(p.mco), marks: p.rb.cues.map(cueMark).sort((a, b) => a.start - b.start) }))

  // ---- playlists ----
  const playlists: RekordboxReport['playlists'] = []
  const usedMco = new Set<number>()
  const byPath = new Map(mco.playlists.map((p) => [JSON.stringify(p.path), p]))
  const bySource = new Map(mco.playlists.filter((p) => p.sourcePath).map((p) => [p.sourcePath!, p]))
  for (const { path, paths } of flatten(rb.tree)) {
    const name = path.join(' / ')
    const rbIds: number[] = []
    let notInCollection = 0
    for (const p of paths) {
      const id = mco.match(p)
      if (id === undefined || !byId.has(id)) notInCollection++
      else if (!rbIds.includes(id)) rbIds.push(id)
    }
    const counterpart = bySource.get(JSON.stringify(path)) ?? byPath.get(JSON.stringify(path))
    if (!counterpart || usedMco.has(counterpart.id)) {
      playlists.push({ kind: 'only-rekordbox', name, rekordboxSongs: paths.length, mcoSongs: null, onlyRekordbox: [], onlyMco: [], orderDiffers: false, notInCollection, goneFromRekordbox: false })
      continue
    }
    usedMco.add(counterpart.id)
    const mcoIds = counterpart.trackIds
    const inMco = new Set(mcoIds)
    const inRb = new Set(rbIds)
    const onlyRekordbox = rbIds.filter((id) => !inMco.has(id))
    const onlyMco = mcoIds.filter((id) => !inRb.has(id))
    const common = (ids: number[], other: Set<number>) => ids.filter((id) => other.has(id)).join(',')
    const orderDiffers = common(rbIds, inMco) !== common(mcoIds, inRb)
    const same = onlyRekordbox.length === 0 && onlyMco.length === 0 && !orderDiffers
    playlists.push({
      kind: same ? 'same' : 'different',
      name,
      rekordboxSongs: paths.length,
      mcoSongs: mcoIds.length,
      onlyRekordbox: onlyRekordbox.slice(0, 50).map(label),
      onlyMco: onlyMco.slice(0, 50).map(label),
      orderDiffers,
      notInCollection,
      goneFromRekordbox: false,
    })
  }
  for (const p of mco.playlists) {
    if (usedMco.has(p.id)) continue
    playlists.push({
      kind: 'only-mco',
      name: p.path.join(' / '),
      rekordboxSongs: null,
      mcoSongs: p.trackIds.length,
      onlyRekordbox: [],
      onlyMco: [],
      orderDiffers: false,
      notInCollection: 0,
      goneFromRekordbox: p.source === 'rekordbox',
    })
  }
  const order = { different: 0, 'only-rekordbox': 1, 'only-mco': 2, same: 3 }
  playlists.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))

  return {
    file,
    rekordboxVersion: rb.version,
    rekordboxTracks: rb.tracks.length,
    matched: pairs.length,
    mcoTracks: mco.tracks.filter((t) => t.present).length,
    playlists,
    info: FIELDS.map((field) => {
      const rows = info.get(field) ?? []
      return { field, count: rows.length, rows: rows.slice(0, ROWS) }
    }),
    cues: { count: cueRows.reduce((n, r) => n + r.marks.length, 0), songs: cueRows.length, rows: cueRows.slice(0, ROWS) },
    files: (Object.keys(files) as (keyof typeof files)[]).map((kind) => ({ kind, count: files[kind].length, rows: files[kind].slice(0, ROWS) })),
  }
}

// MCO's side, from its database.
export function loadMcoSide(db: AppDatabase, collectionFolder: string | null): McoSide {
  const rows = db
    .prepare('SELECT id, path, filename, title, artist, album, year, bpm, musical_key, present FROM tracks')
    .all() as {
    id: number
    path: string
    filename: string
    title: string | null
    artist: string | null
    album: string | null
    year: number | null
    bpm: number | null
    musical_key: string | null
    present: number
  }[]
  const tagRows = db
    .prepare(
      `SELECT tg.track_id AS id, g.name AS name, 0 AS sub FROM track_genres tg JOIN genres g ON g.id = tg.genre_id
       UNION ALL
       SELECT ts.track_id, s.name, 1 FROM track_subgenres ts JOIN subgenres s ON s.id = ts.subgenre_id
       ORDER BY sub, name COLLATE NOCASE`
    )
    .all() as { id: number; name: string; sub: number }[]
  const tags = new Map<number, string[]>()
  for (const r of tagRows) tags.set(r.id, [...(tags.get(r.id) ?? []), r.name])

  const nodes = getPlaylistNodes(db)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const sourcePaths = new Map(
    (db.prepare("SELECT id, source_path FROM playlist_nodes WHERE source_path IS NOT NULL").all() as { id: number; source_path: string }[]).map(
      (r) => [r.id, r.source_path]
    )
  )
  const pathOf = (id: number): string[] => {
    const chain = []
    for (let n = byId.get(id); n; n = n.parentId === null ? undefined : byId.get(n.parentId)) chain.unshift(n)
    // MCO's "Rekordbox" import folder isn't part of Rekordbox's tree.
    if (chain[0]?.source === 'rekordbox' && sourcePaths.get(chain[0].id) === '[]') chain.shift()
    return chain.map((n) => n.name)
  }
  return {
    collectionFolder,
    tracks: rows.map((r) => ({
      id: r.id,
      path: r.path,
      filename: r.filename,
      title: r.title,
      artist: r.artist,
      album: r.album,
      year: r.year,
      bpm: r.bpm,
      musicalKey: r.musical_key,
      present: r.present === 1,
      tags: tags.get(r.id) ?? [],
    })),
    playlists: nodes
      .filter((n) => n.kind === 'playlist')
      .map((n) => ({ id: n.id, path: pathOf(n.id), source: n.source, sourcePath: sourcePaths.get(n.id) ?? null, trackIds: getPlaylistTrackIds(db, n.id) })),
    match: trackMatcher(db),
  }
}
