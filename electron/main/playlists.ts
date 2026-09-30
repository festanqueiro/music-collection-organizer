// Playlists and their folders (docs/features/playlists.md, ADR 0050): one
// tree in playlist_nodes, songs in order in playlist_tracks. Deleting a
// node deletes what's under it (ON DELETE CASCADE); tracks are never
// touched, and a track deleted from the collection leaves every playlist.
import { runInTransaction, type AppDatabase } from './db'
import type { PlaylistNode, RekordboxImportPlan } from '../../src/types'
import type { RekordboxNode, RekordboxTxtRow } from './rekordboxXml'

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

// File paths → track ids: exact (NFC), then ignoring case.
function trackMatcher(db: AppDatabase): (path: string) => number | undefined {
  const rows = db.prepare('SELECT id, path FROM tracks').all() as { id: number; path: string }[]
  const exact = new Map<string, number>()
  const loose = new Map<string, number>()
  for (const r of rows) {
    const nfc = r.path.normalize('NFC')
    exact.set(nfc, r.id)
    loose.set(nfc.toLowerCase(), r.id)
  }
  return (path) => exact.get(path.normalize('NFC')) ?? loose.get(path.normalize('NFC').toLowerCase())
}

function importedNodes(db: AppDatabase): Map<string, { id: number; kind: string; name: string }> {
  const rows = db
    .prepare("SELECT id, kind, name, source_path FROM playlist_nodes WHERE source = 'rekordbox' AND source_path IS NOT NULL")
    .all() as { id: number; kind: string; name: string; source_path: string }[]
  return new Map(rows.map((r) => [`${r.kind}:${r.source_path}`, r]))
}

export function planRekordboxImport(db: AppDatabase, tree: RekordboxNode[]): RekordboxImportPlan {
  const match = trackMatcher(db)
  const existing = importedNodes(db)
  const flat = flatten(tree)
  const plan: RekordboxImportPlan = { folders: 0, playlists: [], songs: 0, matched: 0, gone: [] }
  const incoming = new Set<string>()
  for (const { node, path } of flat) {
    const key = `${node.kind}:${JSON.stringify(path)}`
    incoming.add(key)
    if (node.kind === 'folder') {
      plan.folders++
      continue
    }
    const matched = new Set(node.paths.map(match).filter((id) => id !== undefined)).size
    plan.playlists.push({ name: path.join(' / '), songs: node.paths.length, matched, refresh: existing.has(key) })
    plan.songs += node.paths.length
    plan.matched += matched
  }
  for (const [key, node] of existing) if (node.kind === 'playlist' && !incoming.has(key)) plan.gone.push(node.name)
  return plan
}

export function applyRekordboxImport(db: AppDatabase, tree: RekordboxNode[]): void {
  runInTransaction(db, () => {
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
        if (position !== null) db.prepare('UPDATE playlist_nodes SET position = ?, updated_at = ? WHERE id = ?').run(position, now, found.id)
        return found.id
      }
      return insertNode.run(parentId, kind, name, position ?? nextPosition(db, parentId), path, now, now).lastInsertRowid as number
    }
    const rootId = ensure('folder', 'Rekordbox', ROOT_PATH, null, null)
    const ids = new Map<string, number>([[ROOT_PATH, rootId]])
    const siblings = new Map<number, number>()
    for (const { node, path } of flatten(tree)) {
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
