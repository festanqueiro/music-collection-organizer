// Playlists and their folders (docs/features/playlists.md, ADR 0050): one
// tree in playlist_nodes, songs in order in playlist_tracks. Deleting a
// node deletes what's under it (ON DELETE CASCADE); tracks are never
// touched, and a track deleted from the collection leaves every playlist.
import { statSync } from 'node:fs'
import { runInTransaction, type AppDatabase } from './db'
import type { PlaylistNode, RekordboxDuplicate, RekordboxDuplicateAction, RekordboxImportPlan, RekordboxRelink } from '../../src/types'
import type { RekordboxNode, RekordboxTxtRow, SongHint } from './rekordboxXml'

interface NodeRow {
  id: number
  parent_id: number | null
  kind: 'folder' | 'playlist'
  name: string
  position: number
  source: 'mco' | 'rekordbox'
  track_count: number
}

// The whole tree, parents before children, siblings in order.
export function getPlaylistNodes(db: AppDatabase): PlaylistNode[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.parent_id, n.kind, n.name, n.position, n.source,
              (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = n.id) AS track_count
       FROM playlist_nodes n ORDER BY n.position, n.id`
    )
    .all() as unknown as NodeRow[]
  const byParent = new Map<number | null, NodeRow[]>()
  for (const row of rows) byParent.set(row.parent_id, [...(byParent.get(row.parent_id) ?? []), row])
  const out: PlaylistNode[] = []
  const walk = (parentId: number | null) => {
    for (const r of byParent.get(parentId) ?? []) {
      out.push({ id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, position: r.position, source: r.source, trackCount: r.track_count })
      walk(r.id)
    }
  }
  walk(null)
  return out
}

function nextPosition(db: AppDatabase, parentId: number | null): number {
  const row = db
    .prepare('SELECT MAX(position) AS max FROM playlist_nodes WHERE parent_id IS ?')
    .get(parentId) as { max: number | null }
  return (row.max ?? -1) + 1
}

function assertFolder(db: AppDatabase, parentId: number | null): void {
  if (parentId === null) return
  const row = db.prepare('SELECT kind FROM playlist_nodes WHERE id = ?').get(parentId) as { kind: string } | undefined
  if (row?.kind !== 'folder') throw new Error('A playlist can only go inside a folder')
}

// A new playlist or folder at the end of `parentId` (null = the top level).
export function createPlaylistNode(db: AppDatabase, kind: 'folder' | 'playlist', name: string, parentId: number | null): number {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A name is needed')
  assertFolder(db, parentId)
  const now = Date.now()
  return db
    .prepare(
      'INSERT INTO playlist_nodes (parent_id, kind, name, position, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(parentId, kind, trimmed, nextPosition(db, parentId), 'mco', now, now).lastInsertRowid as number
}

export function renamePlaylistNode(db: AppDatabase, id: number, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A name is needed')
  db.prepare('UPDATE playlist_nodes SET name = ?, updated_at = ? WHERE id = ?').run(trimmed, Date.now(), id)
}

// The node and everything under it.
export function deletePlaylistNode(db: AppDatabase, id: number): void {
  db.prepare('DELETE FROM playlist_nodes WHERE id = ?').run(id)
}

export function getPlaylistTrackIds(db: AppDatabase, playlistId: number): number[] {
  return (
    db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(playlistId) as {
      track_id: number
    }[]
  ).map((r) => r.track_id)
}

// A playlist's songs, or for a folder every playlist under it in tree
// order — what "Play" queues.
export function getNodeTrackIds(db: AppDatabase, id: number): number[] {
  const nodes = getPlaylistNodes(db)
  const under = new Set([id])
  const ids: number[] = []
  for (const node of nodes) {
    if (node.id !== id && (node.parentId === null || !under.has(node.parentId))) continue
    under.add(node.id)
    if (node.kind === 'playlist') ids.push(...getPlaylistTrackIds(db, node.id))
  }
  return ids
}

// Appends the songs that aren't in the playlist yet, in the order given.
export function addTracksToPlaylist(db: AppDatabase, playlistId: number, trackIds: number[]): { added: number; skipped: number } {
  return runInTransaction(db, () => {
    const node = db.prepare('SELECT kind FROM playlist_nodes WHERE id = ?').get(playlistId) as { kind: string } | undefined
    if (node?.kind !== 'playlist') throw new Error('Not a playlist')
    const present = new Set(getPlaylistTrackIds(db, playlistId))
    const row = db.prepare('SELECT MAX(position) AS max FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as {
      max: number | null
    }
    let position = (row.max ?? -1) + 1
    const insert = db.prepare('INSERT INTO playlist_tracks (playlist_id, position, track_id) VALUES (?, ?, ?)')
    let added = 0
    for (const trackId of trackIds) {
      if (present.has(trackId)) continue
      present.add(trackId)
      insert.run(playlistId, position++, trackId)
      added++
    }
    if (added > 0) db.prepare('UPDATE playlist_nodes SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
    return { added, skipped: trackIds.length - added }
  })
}

export function removeTracksFromPlaylist(db: AppDatabase, playlistId: number, trackIds: number[]): number {
  return runInTransaction(db, () => {
    const remove = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
    let removed = 0
    for (const trackId of trackIds) removed += Number(remove.run(playlistId, trackId).changes)
    if (removed > 0) db.prepare('UPDATE playlist_nodes SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
    return removed
  })
}

// Rewrites a playlist's songs in this order (a reorder, or an undo putting
// removed songs back). Each song once; ids no longer in the collection
// (deleted to the Trash meanwhile) are dropped.
export function setPlaylistTrackIds(db: AppDatabase, playlistId: number, trackIds: number[]): void {
  runInTransaction(db, () => {
    const node = db.prepare('SELECT kind FROM playlist_nodes WHERE id = ?').get(playlistId) as { kind: string } | undefined
    if (node?.kind !== 'playlist') throw new Error('Not a playlist')
    const exists = db.prepare('SELECT 1 FROM tracks WHERE id = ?')
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId)
    const insert = db.prepare('INSERT INTO playlist_tracks (playlist_id, position, track_id) VALUES (?, ?, ?)')
    let position = 0
    for (const trackId of new Set(trackIds)) {
      if (exists.get(trackId)) insert.run(playlistId, position++, trackId)
    }
    db.prepare('UPDATE playlist_nodes SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
  })
}

// ---- Rekordbox import (ADR 0050) ----
// Imported nodes live under one top folder "Rekordbox" and remember their
// name path in Rekordbox's tree (source_path, a JSON array), so importing
// again refreshes them. "Keep as my own" turns a node back into an MCO one.

const ROOT_PATH = '[]'

// Every playlist and folder with its name path; a repeated name among
// siblings gets " (2)", " (3)"… so each path is unique.
function flatten(nodes: RekordboxNode[], parent: string[] = []): { node: RekordboxNode; path: string[] }[] {
  const out: { node: RekordboxNode; path: string[] }[] = []
  const seen = new Map<string, number>()
  for (const node of nodes) {
    const key = `${node.kind}:${node.name}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const path = [...parent, n > 1 ? `${node.name} (${n})` : node.name]
    out.push({ node, path })
    if (node.kind === 'folder') out.push(...flatten(node.children, path))
  }
  return out
}

// File paths → track ids: exact (NFC), then ignoring case, then a path the
// user confirmed earlier is a collection song (playlist_path_aliases).
export function trackMatcher(db: AppDatabase): (path: string) => number | undefined {
  const rows = db.prepare('SELECT id, path FROM tracks').all() as { id: number; path: string }[]
  const exact = new Map<string, number>()
  const loose = new Map<string, number>()
  for (const r of rows) {
    const nfc = r.path.normalize('NFC')
    exact.set(nfc, r.id)
    loose.set(nfc.toLowerCase(), r.id)
  }
  const aliases = new Map(
    (db.prepare('SELECT path, track_id FROM playlist_path_aliases').all() as { path: string; track_id: number }[]).map((r) => [
      r.path,
      r.track_id,
    ])
  )
  return (path) => {
    const nfc = path.normalize('NFC')
    return exact.get(nfc) ?? loose.get(nfc.toLowerCase()) ?? aliases.get(nfc)
  }
}

// Ignoring case, spacing and punctuation — for titles, artists, file names.
const looseKey = (s: string | null | undefined) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const stem = (path: string) => looseKey((path.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, ''))

export type FileSize = (path: string) => number | undefined
const fileSize: FileSize = (path) => {
  try {
    return statSync(path).size
  } catch {
    return undefined
  }
}

// A song whose path isn't in the collection (an old USB stick's, a moved
// file) may still be one of its songs. Tried in order, each only when
// exactly one present song fits, durations within 2 s when both known:
// the same file size (the stick's file if it's plugged in, or the size the
// export gives), the same title and artist, the same file name (or one
// Rekordbox shortened on the stick: "… - 04 Kings Music - Pa.aiff").
// Only ever a suggestion — the import summary asks before using it.
function elsewhereFinder(db: AppDatabase, sizeOf: FileSize): (path: string, hint: SongHint) => { trackId: number; reason: string } | null {
  const rows = db
    .prepare('SELECT id, path, size, duration, title, artist FROM tracks WHERE present = 1')
    .all() as { id: number; path: string; size: number; duration: number | null; title: string | null; artist: string | null }[]
  const bySize = new Map<number, typeof rows>()
  const byTitleArtist = new Map<string, typeof rows>()
  for (const r of rows) {
    bySize.set(r.size, [...(bySize.get(r.size) ?? []), r])
    if (r.title && r.artist) {
      const key = `${looseKey(r.title)}|${looseKey(r.artist)}`
      byTitleArtist.set(key, [...(byTitleArtist.get(key) ?? []), r])
    }
  }
  const stems = rows.map((r) => ({ row: r, stem: stem(r.path) }))
  return (path, hint) => {
    const fits = (r: (typeof rows)[number]) =>
      hint.duration === undefined || r.duration === null || Math.abs(r.duration - hint.duration) <= 2
    const one = (candidates: typeof rows | undefined) => {
      const ok = (candidates ?? []).filter(fits)
      return ok.length === 1 ? ok[0] : null
    }
    const size = hint.size ?? sizeOf(path)
    const sameSize = size ? one(bySize.get(size)) : null
    if (sameSize) return { trackId: sameSize.id, reason: 'same file size' }
    if (hint.title && hint.artist) {
      const sameTags = one(byTitleArtist.get(`${looseKey(hint.title)}|${looseKey(hint.artist)}`))
      if (sameTags) return { trackId: sameTags.id, reason: 'same title and artist' }
    }
    const name = stem(path)
    if (name) {
      const sameName = one(stems.filter((s) => s.stem === name || (name.length >= 12 && s.stem.startsWith(name))).map((s) => s.row))
      if (sameName) return { trackId: sameName.id, reason: 'same file name' }
    }
    return null
  }
}

function importedNodes(db: AppDatabase): Map<string, { id: number; kind: string; name: string; parent_id: number | null }> {
  const rows = db
    .prepare("SELECT id, kind, name, parent_id, source_path FROM playlist_nodes WHERE source = 'rekordbox' AND source_path IS NOT NULL")
    .all() as { id: number; kind: string; name: string; parent_id: number | null; source_path: string }[]
  return new Map(rows.map((r) => [`${r.kind}:${r.source_path}`, r]))
}

// A playlist MCO already has that looks like an incoming one: the same
// name (ignoring case and punctuation) or the same songs (all, or at least
// 80% of the two together). The best one wins: same songs and name, then
// same songs, then mostly the same, then just the name.
function duplicateFinder(db: AppDatabase, exclude: Set<number>): (name: string, trackIds: number[]) => RekordboxDuplicate | null {
  const nodes = getPlaylistNodes(db)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pathOf = (id: number) => {
    const parts: string[] = []
    for (let n = byId.get(id); n; n = n.parentId === null ? undefined : byId.get(n.parentId)) parts.unshift(n.name)
    return parts.join(' / ')
  }
  const candidates = nodes
    .filter((n) => n.kind === 'playlist' && !exclude.has(n.id))
    .map((n) => ({ node: n, ids: new Set(getPlaylistTrackIds(db, n.id)) }))
  return (name, trackIds) => {
    const incoming = new Set(trackIds)
    let best: { found: RekordboxDuplicate; score: number } | null = null
    for (const { node, ids } of candidates) {
      const sameName = looseKey(node.name) === looseKey(name) && looseKey(name) !== ''
      const shared = [...incoming].filter((id) => ids.has(id)).length
      const union = new Set([...incoming, ...ids]).size
      const songs: RekordboxDuplicate['songs'] =
        incoming.size > 0 && shared === incoming.size && shared === ids.size ? 'same' : union > 0 && shared / union >= 0.8 ? 'most' : 'different'
      if (!sameName && songs === 'different') continue
      const score = (songs === 'same' ? 4 : songs === 'most' ? 2 : 0) + (sameName ? 1 : 0)
      if (!best || score > best.score) {
        best = { found: { id: node.id, name: pathOf(node.id), sameName, songs, shared, mcoSongs: ids.size }, score }
      }
    }
    return best?.found ?? null
  }
}

export function planRekordboxImport(db: AppDatabase, tree: RekordboxNode[], sizeOf: FileSize = fileSize): RekordboxImportPlan {
  const match = trackMatcher(db)
  const elsewhere = elsewhereFinder(db, sizeOf)
  const existing = importedNodes(db)
  // Playlists this import refreshes aren't duplicates of themselves.
  const findDuplicate = duplicateFinder(db, new Set([...existing.values()].map((n) => n.id)))
  const flat = flatten(tree)
  const plan: RekordboxImportPlan = { folders: 0, playlists: [], songs: 0, matched: 0, relinks: [], gone: [] }
  // Each unmatched path looked up once, however many playlists list it.
  const relinkByPath = new Map<string, RekordboxRelink | null>()
  const trackLabel = db.prepare('SELECT path, title, artist, filename FROM tracks WHERE id = ?')
  const incoming = new Set<string>()
  for (const { node, path } of flat) {
    const key = `${node.kind}:${JSON.stringify(path)}`
    incoming.add(key)
    if (node.kind === 'folder') {
      plan.folders++
      continue
    }
    const matched = new Set(node.paths.map(match).filter((id) => id !== undefined)).size
    let relinked = 0
    node.paths.forEach((songPath, i) => {
      if (match(songPath) !== undefined) return
      const from = songPath.normalize('NFC')
      if (!relinkByPath.has(from)) {
        const found = elsewhere(from, node.hints?.[i] ?? {})
        let relink: RekordboxRelink | null = null
        if (found) {
          const t = trackLabel.get(found.trackId) as { path: string; title: string | null; artist: string | null; filename: string }
          const label = t.title ? (t.artist ? `${t.artist} - ${t.title}` : t.title) : t.filename
          relink = { from, trackId: found.trackId, to: t.path, label, reason: found.reason }
          plan.relinks.push(relink)
        }
        relinkByPath.set(from, relink)
      }
      if (relinkByPath.get(from)) relinked++
    })
    const refresh = existing.has(key)
    const ids = [...new Set(node.paths.map(match).filter((id): id is number => id !== undefined))]
    plan.playlists.push({
      key: JSON.stringify(path),
      name: path.join(' / '),
      songs: node.paths.length,
      matched,
      relinked,
      refresh,
      duplicate: refresh ? null : findDuplicate(path[path.length - 1], ids),
    })
    plan.songs += node.paths.length
    plan.matched += matched
  }
  for (const [key, node] of existing) if (node.kind === 'playlist' && !incoming.has(key)) plan.gone.push(node.name)
  return plan
}

// `relinks`: the songs found at another path that the user confirmed —
// remembered, so the next import of the same export needs no asking.
// `duplicates`: for playlists MCO already seemed to have (by their key),
// skip them, import them as new ones (the default), or update MCO's with
// Rekordbox's songs — which also links it, so later imports refresh it
// where it is.
export function applyRekordboxImport(
  db: AppDatabase,
  tree: RekordboxNode[],
  relinks: { from: string; trackId: number }[] = [],
  duplicates: Record<string, { action: RekordboxDuplicateAction; targetId?: number }> = {}
): void {
  runInTransaction(db, () => {
    const remember = db.prepare(
      'INSERT OR REPLACE INTO playlist_path_aliases (path, track_id) SELECT ?, id FROM tracks WHERE id = ?'
    )
    for (const r of relinks) remember.run(r.from.normalize('NFC'), r.trackId)
    const match = trackMatcher(db)
    const existing = importedNodes(db)
    const now = Date.now()
    const insertNode = db.prepare(
      "INSERT INTO playlist_nodes (parent_id, kind, name, position, source, source_path, created_at, updated_at) VALUES (?, ?, ?, ?, 'rekordbox', ?, ?, ?)"
    )
    // Found again: back in Rekordbox's order (the top folder stays put).
    const ensure = (kind: 'folder' | 'playlist', name: string, path: string, parentId: number | null, position: number | null) => {
      const found = existing.get(`${kind}:${path}`)
      if (found) {
        // A linked MCO playlist stays where the user keeps it.
        if (position !== null && found.parent_id === parentId)
          db.prepare('UPDATE playlist_nodes SET position = ?, updated_at = ? WHERE id = ?').run(position, now, found.id)
        return found.id
      }
      return insertNode.run(parentId, kind, name, position ?? nextPosition(db, parentId), path, now, now).lastInsertRowid as number
    }
    const rootId = ensure('folder', 'Rekordbox', ROOT_PATH, null, null)
    const ids = new Map<string, number>([[ROOT_PATH, rootId]])
    const siblings = new Map<number, number>()
    for (const { node, path } of flatten(tree)) {
      const decision = node.kind === 'playlist' && !existing.has(`playlist:${JSON.stringify(path)}`) ? duplicates[JSON.stringify(path)] : undefined
      if (decision?.action === 'skip') continue
      if (decision?.action === 'update' && decision.targetId !== undefined && node.kind === 'playlist') {
        const target = db.prepare("SELECT id FROM playlist_nodes WHERE id = ? AND kind = 'playlist'").get(decision.targetId) as { id: number } | undefined
        if (target) {
          db.prepare("UPDATE playlist_nodes SET source = 'rekordbox', source_path = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(path), now, target.id)
          db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(target.id)
          addTracksToPlaylist(db, target.id, node.paths.map(match).filter((t): t is number => t !== undefined))
          continue
        }
      }
      const parentId = ids.get(JSON.stringify(path.slice(0, -1)))!
      const position = siblings.get(parentId) ?? 0
      siblings.set(parentId, position + 1)
      const id = ensure(node.kind, path[path.length - 1], JSON.stringify(path), parentId, position)
      ids.set(JSON.stringify(path), id)
      if (node.kind === 'playlist') {
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id)
        addTracksToPlaylist(db, id, node.paths.map(match).filter((t): t is number => t !== undefined))
      }
    }
  })
}

// Refreshes skip it from now on.
export function detachPlaylistNode(db: AppDatabase, id: number): void {
  db.prepare("UPDATE playlist_nodes SET source = 'mco', source_path = NULL, updated_at = ? WHERE id = ?").run(Date.now(), id)
}

// A text export's rows as a playlist of file paths: by path when it has
// one, else by title + artist (ignoring case, spacing and punctuation),
// else by title alone when only one song has it, else by file name.
// Unmatched rows keep a placeholder that matches nothing, so the summary
// counts them.
export function rekordboxTxtToTree(db: AppDatabase, name: string, rows: RekordboxTxtRow[]): RekordboxNode[] {
  const key = (s: string | null) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const tracks = db.prepare('SELECT path, filename, title, artist FROM tracks').all() as {
    path: string
    filename: string
    title: string | null
    artist: string | null
  }[]
  const byTitleArtist = new Map<string, string>()
  const byTitle = new Map<string, string[]>()
  // Songs without tags show their file name as the title in Rekordbox.
  const byFilename = new Map<string, string>()
  for (const t of tracks) {
    byTitleArtist.set(`${key(t.title)}|${key(t.artist)}`, t.path)
    byTitle.set(key(t.title), [...(byTitle.get(key(t.title)) ?? []), t.path])
    byFilename.set(key(t.filename.replace(/\.[^.]+$/, '')), t.path)
  }
  const paths = rows.map((row, i) => {
    if (row.path) return row.path
    const both = byTitleArtist.get(`${key(row.title)}|${key(row.artist)}`)
    if (both) return both
    const titled = byTitle.get(key(row.title))
    if (titled?.length === 1) return titled[0]
    return byFilename.get(key(row.title)) ?? `\0unmatched:${i}`
  })
  return [{ kind: 'playlist', name, paths }]
}

// Moves a node next to another ('before'/'after'), into a folder ('into',
// at the end), or to the end of the top level (targetId null). Siblings
// are renumbered in their new order. A folder can't go inside itself.
export function movePlaylistNode(
  db: AppDatabase,
  id: number,
  targetId: number | null,
  where: 'before' | 'after' | 'into'
): void {
  runInTransaction(db, () => {
    const nodes = getPlaylistNodes(db)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const target = targetId === null ? null : byId.get(targetId)
    if (!byId.has(id) || (targetId !== null && !target) || id === targetId) return
    const parentId = target === null ? null : where === 'into' ? target!.id : target!.parentId
    if (parentId !== null && byId.get(parentId)?.kind !== 'folder') throw new Error('A playlist can only go inside a folder')
    for (let p = parentId; p !== null; p = byId.get(p)?.parentId ?? null) {
      if (p === id) throw new Error("A folder can't go inside itself")
    }
    const siblings = nodes.filter((n) => n.parentId === parentId && n.id !== id).map((n) => n.id)
    let index = siblings.length
    if (target && where !== 'into') index = siblings.indexOf(target.id) + (where === 'after' ? 1 : 0)
    siblings.splice(index, 0, id)
    const update = db.prepare('UPDATE playlist_nodes SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?')
    const now = Date.now()
    siblings.forEach((siblingId, position) => update.run(parentId, position, now, siblingId))
  })
}

// A playlist as an .m3u8 Rekordbox can import (File → Import → Import
// Playlist, or drag the file into its tree): #EXTINF with the length and
// "Artist - Title", then the file's path. Songs whose file is gone are left
// out, since Rekordbox couldn't load them.
export function playlistToM3u(db: AppDatabase, playlistId: number): { text: string; songs: number } {
  const rows = db
    .prepare(
      `SELECT t.path, t.filename, t.title, t.artist, t.duration FROM playlist_tracks p
       JOIN tracks t ON t.id = p.track_id WHERE p.playlist_id = ? AND t.present = 1 ORDER BY p.position`
    )
    .all(playlistId) as { path: string; filename: string; title: string | null; artist: string | null; duration: number | null }[]
  const lines = ['#EXTM3U']
  for (const r of rows) {
    const label = r.title ? (r.artist ? `${r.artist} - ${r.title}` : r.title) : r.filename
    lines.push(`#EXTINF:${Math.round(r.duration ?? -1)},${label.replace(/[\r\n]+/g, ' ')}`, r.path)
  }
  return { text: lines.join('\n') + '\n', songs: rows.length }
}

// Every playlist under a folder, named by its path below it ("Sets - Bassin").
export function folderPlaylists(db: AppDatabase, folderId: number): { id: number; name: string }[] {
  const nodes = getPlaylistNodes(db)
  const names = new Map<number, string[]>([[folderId, []]])
  const out: { id: number; name: string }[] = []
  for (const node of nodes) {
    const parent = node.parentId === null ? undefined : names.get(node.parentId)
    if (!parent) continue
    names.set(node.id, [...parent, node.name])
    if (node.kind === 'playlist') out.push({ id: node.id, name: [...parent, node.name].join(' - ') })
  }
  return out
}
