// Playlists and their folders (docs/features/playlists.md, ADR 0050): one
// tree in playlist_nodes, songs in order in playlist_tracks. Deleting a
// node deletes what's under it (ON DELETE CASCADE); tracks are never
// touched, and a track deleted from the collection leaves every playlist.
import { runInTransaction, type AppDatabase } from './db'
import type { PlaylistNode } from '../../src/types'

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
