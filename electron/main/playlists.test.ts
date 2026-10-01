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
  setPlaylistTrackIds,
  applyRekordboxImport,
  detachPlaylistNode,
  planRekordboxImport,
  rekordboxTxtToTree,
  movePlaylistNode,
  playlistToM3u,
  folderPlaylists,
} from './playlists'
import type { RekordboxNode } from './rekordboxXml'

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

  it('rewrites the order, each song once, dropping tracks no longer in the collection', () => {
    const p = createPlaylistNode(db, 'playlist', 'P', null)
    addTracksToPlaylist(db, p, t)
    setPlaylistTrackIds(db, p, [t[3], t[1], t[0], t[2]])
    expect(getPlaylistTrackIds(db, p)).toEqual([t[3], t[1], t[0], t[2]])
    db.prepare('DELETE FROM tracks WHERE id = ?').run(t[1])
    setPlaylistTrackIds(db, p, [t[0], t[1], t[0], 999, t[2]])
    expect(getPlaylistTrackIds(db, p)).toEqual([t[0], t[2]])
    const f = createPlaylistNode(db, 'folder', 'F', null)
    expect(() => setPlaylistTrackIds(db, f, [t[0]])).toThrow()
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

describe('rekordbox import', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = openDatabase(':memory:')
    const insert = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime, title, artist) VALUES (?, ?, '/', 'wav', 1, 1, ?, ?)`)
    insert.run('/m/a.wav', 'a.wav', 'Hornsman', 'King Earthquake')
    insert.run('/m/b.wav', 'b.wav', 'Long Time ft. Galas', 'D-Operation Drop')
  })
  const tree = (paths: string[]): RekordboxNode[] => [
    { kind: 'folder', name: 'Sets', children: [{ kind: 'playlist', name: 'Bassin', paths }] },
  ]

  it('plans, imports under a Rekordbox folder, and refreshes on a second import', () => {
    const plan = planRekordboxImport(db, tree(['/m/b.wav', '/M/A.wav', '/elsewhere.wav']))
    expect(plan).toMatchObject({ folders: 1, songs: 3, matched: 2, gone: [] })
    expect(plan.playlists).toEqual([{ name: 'Sets / Bassin', songs: 3, matched: 2, refresh: false }])
    applyRekordboxImport(db, tree(['/m/b.wav', '/M/A.wav', '/elsewhere.wav']))
    const nodes = getPlaylistNodes(db)
    expect(nodes.map((n) => [n.name, n.kind, n.source])).toEqual([
      ['Rekordbox', 'folder', 'rekordbox'],
      ['Sets', 'folder', 'rekordbox'],
      ['Bassin', 'playlist', 'rekordbox'],
    ])
    const bassin = nodes[2].id
    expect(getPlaylistTrackIds(db, bassin)).toHaveLength(2)

    expect(planRekordboxImport(db, tree(['/m/a.wav'])).playlists[0].refresh).toBe(true)
    applyRekordboxImport(db, tree(['/m/a.wav']))
    expect(getPlaylistNodes(db)).toHaveLength(3)
    expect(getPlaylistTrackIds(db, bassin)).toHaveLength(1)
    expect(planRekordboxImport(db, []).gone).toEqual(['Bassin'])
  })

  it('leaves playlists made in MCO or kept as own alone', () => {
    applyRekordboxImport(db, tree(['/m/a.wav']))
    const bassin = getPlaylistNodes(db).find((n) => n.name === 'Bassin')!.id
    detachPlaylistNode(db, bassin)
    applyRekordboxImport(db, tree(['/m/b.wav']))
    const named = getPlaylistNodes(db).filter((n) => n.name === 'Bassin')
    expect(named).toHaveLength(2)
    expect(getPlaylistTrackIds(db, bassin)).toHaveLength(1)
  })

  it('matches a text export by title and artist, ignoring case and punctuation', () => {
    const [node] = rekordboxTxtToTree(db, 'Starters', [
      { title: 'HORNSMAN', artist: 'King Earthquake' },
      { title: 'Long Time ft Galas', artist: 'D-Operation Drop / DPRTNDRP' },
      { title: 'Unknown', artist: 'Nobody' },
    ])
    expect(node.kind === 'playlist' && node.paths.slice(0, 2)).toEqual(['/m/a.wav', '/m/b.wav'])
    expect(planRekordboxImport(db, [node]).matched).toBe(2)
  })
})

describe('moving playlists', () => {
  it('moves into folders, before/after siblings, and to the top; never into itself', () => {
    const db = openDatabase(':memory:')
    const f = createPlaylistNode(db, 'folder', 'F', null)
    const g = createPlaylistNode(db, 'folder', 'G', f)
    const a = createPlaylistNode(db, 'playlist', 'A', null)
    const b = createPlaylistNode(db, 'playlist', 'B', null)
    const names = () => getPlaylistNodes(db).map((n) => `${n.name}<${n.parentId === null ? '' : getPlaylistNodes(db).find((p) => p.id === n.parentId)!.name}`)
    movePlaylistNode(db, b, f, 'into')
    expect(names()).toEqual(['F<', 'G<F', 'B<F', 'A<'])
    movePlaylistNode(db, a, g, 'before')
    expect(names()).toEqual(['F<', 'A<F', 'G<F', 'B<F'])
    movePlaylistNode(db, a, b, 'after')
    expect(names()).toEqual(['F<', 'G<F', 'B<F', 'A<F'])
    movePlaylistNode(db, b, null, 'into')
    expect(names()).toEqual(['F<', 'G<F', 'A<F', 'B<'])
    expect(() => movePlaylistNode(db, f, g, 'into')).toThrow()
    expect(() => movePlaylistNode(db, g, a, 'into')).toThrow()
  })
})

describe('m3u8 export', () => {
  it('writes #EXTINF lines and paths in order, leaving out missing files; names a folder\'s playlists by path', () => {
    const db = openDatabase(':memory:')
    const insert = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime, title, artist, duration, present) VALUES (?, ?, '/', 'wav', 1, 1, ?, ?, ?, ?)`)
    const a = insert.run('/m/a.wav', 'a.wav', 'Hornsman', 'King Earthquake', 204.4, 1).lastInsertRowid as number
    const b = insert.run('/m/b.wav', 'b.wav', null, null, null, 1).lastInsertRowid as number
    const gone = insert.run('/m/c.wav', 'c.wav', 'Gone', null, 10, 0).lastInsertRowid as number
    const f = createPlaylistNode(db, 'folder', 'Sets', null)
    const sub = createPlaylistNode(db, 'folder', '2026', f)
    const p = createPlaylistNode(db, 'playlist', 'Bassin', sub)
    addTracksToPlaylist(db, p, [b, gone, a])
    expect(playlistToM3u(db, p)).toEqual({
      text: '#EXTM3U\n#EXTINF:-1,b.wav\n/m/b.wav\n#EXTINF:204,King Earthquake - Hornsman\n/m/a.wav\n',
      songs: 2,
    })
    expect(folderPlaylists(db, f)).toEqual([{ id: p, name: '2026 - Bassin' }])
  })
})
