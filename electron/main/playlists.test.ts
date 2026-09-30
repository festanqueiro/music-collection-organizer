import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import {
  addTracksToPlaylist,
  createPlaylistNode,
  deletePlaylistNode,
  getNodeTrackIds,
  getPlaylistNodes,
  getPlaylistTrackIds,
  removeTracksFromPlaylist,
  renamePlaylistNode,
} from './playlists'

describe('playlists', () => {
  let db: AppDatabase
  let t: number[]

  beforeEach(() => {
    db = openDatabase(':memory:')
    const insert = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, ?, '/', 'wav', 1, 1)`)
    t = [1, 2, 3, 4].map((n) => insert.run(`/${n}.wav`, `${n}.wav`).lastInsertRowid as number)
  })

  it('builds the tree parents first, siblings in the order made, with song counts', () => {
    const sets = createPlaylistNode(db, 'folder', 'Sets', null)
    const bassin = createPlaylistNode(db, 'playlist', 'Bassin', sets)
    const warmup = createPlaylistNode(db, 'playlist', ' Warm-up ', null)
    const dubs = createPlaylistNode(db, 'playlist', 'Dubs', sets)
    addTracksToPlaylist(db, bassin, [t[0], t[1]])
    expect(getPlaylistNodes(db).map((n) => [n.name, n.parentId, n.trackCount])).toEqual([
      ['Sets', null, 0],
      ['Bassin', sets, 2],
      ['Dubs', sets, 0],
      ['Warm-up', null, 0],
    ])
    expect(getPlaylistNodes(db).find((n) => n.id === warmup)?.source).toBe('mco')
    expect(dubs).toBeGreaterThan(0)
  })

  it('refuses empty names and playlists inside playlists', () => {
    const p = createPlaylistNode(db, 'playlist', 'P', null)
    expect(() => createPlaylistNode(db, 'playlist', '  ', null)).toThrow()
    expect(() => createPlaylistNode(db, 'playlist', 'Q', p)).toThrow()
    expect(() => renamePlaylistNode(db, p, '')).toThrow()
    renamePlaylistNode(db, p, 'Renamed')
    expect(getPlaylistNodes(db)[0].name).toBe('Renamed')
  })

  it('appends songs in order, skipping ones already in it', () => {
    const p = createPlaylistNode(db, 'playlist', 'P', null)
    expect(addTracksToPlaylist(db, p, [t[2], t[0]])).toEqual({ added: 2, skipped: 0 })
    expect(addTracksToPlaylist(db, p, [t[0], t[1], t[1]])).toEqual({ added: 1, skipped: 2 })
    expect(getPlaylistTrackIds(db, p)).toEqual([t[2], t[0], t[1]])
  })

  it('removes songs and keeps the rest in order', () => {
    const p = createPlaylistNode(db, 'playlist', 'P', null)
    addTracksToPlaylist(db, p, t)
    expect(removeTracksFromPlaylist(db, p, [t[1], t[3]])).toBe(2)
    expect(getPlaylistTrackIds(db, p)).toEqual([t[0], t[2]])
    addTracksToPlaylist(db, p, [t[1]])
    expect(getPlaylistTrackIds(db, p)).toEqual([t[0], t[2], t[1]])
  })

  it('deletes a folder with everything in it, never the tracks', () => {
    const f = createPlaylistNode(db, 'folder', 'F', null)
    const inner = createPlaylistNode(db, 'folder', 'Inner', f)
    const p = createPlaylistNode(db, 'playlist', 'P', inner)
    addTracksToPlaylist(db, p, [t[0]])
    deletePlaylistNode(db, f)
    expect(getPlaylistNodes(db)).toEqual([])
    expect((db.prepare('SELECT COUNT(*) AS n FROM playlist_tracks').get() as { n: number }).n).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n).toBe(4)
  })

  it('drops a track deleted from the collection from every playlist', () => {
    const p = createPlaylistNode(db, 'playlist', 'P', null)
    addTracksToPlaylist(db, p, [t[0], t[1]])
    db.prepare('DELETE FROM tracks WHERE id = ?').run(t[0])
    expect(getPlaylistTrackIds(db, p)).toEqual([t[1]])
  })

  it("plays a folder's playlists in tree order", () => {
    const f = createPlaylistNode(db, 'folder', 'F', null)
    const a = createPlaylistNode(db, 'playlist', 'A', f)
    const sub = createPlaylistNode(db, 'folder', 'Sub', f)
    const b = createPlaylistNode(db, 'playlist', 'B', sub)
    const outside = createPlaylistNode(db, 'playlist', 'Outside', null)
    addTracksToPlaylist(db, a, [t[1]])
    addTracksToPlaylist(db, b, [t[2], t[0]])
    addTracksToPlaylist(db, outside, [t[3]])
    expect(getNodeTrackIds(db, f)).toEqual([t[1], t[2], t[0]])
    expect(getNodeTrackIds(db, b)).toEqual([t[2], t[0]])
  })
})
