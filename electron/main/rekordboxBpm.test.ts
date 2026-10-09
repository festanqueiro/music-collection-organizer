import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { importRekordboxBpm } from './rekordboxBpm'
import { importRekordboxCues } from './cues'
import { rememberPathAliases, trackMatcher } from './playlists'
import type { RekordboxCollection, RekordboxTrack } from './rekordboxXml'

const rb = (path: string, bpm: number | null, cues: RekordboxTrack['cues'] = []): RekordboxTrack => ({
  trackId: path, path, name: '', artist: '', album: '', genre: '', comments: '', year: null, bpm, tonality: '', seconds: null, cues,
})
const collection = (...tracks: RekordboxTrack[]): RekordboxCollection => ({ version: null, tracks, tree: [] })

describe('importRekordboxBpm', () => {
  let db: AppDatabase
  const bpms = () => db.prepare('SELECT path, bpm, bpm_edited FROM tracks ORDER BY path').all() as { path: string; bpm: number | null; bpm_edited: number }[]

  beforeEach(() => {
    db = openDatabase(':memory:')
    const insert = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime, bpm) VALUES (?, 'x.wav', '/m', 'wav', 1, 1, ?)`)
    insert.run('/m/a.wav', 106.58)
    insert.run('/m/b.wav', 140)
    insert.run('/m/c.wav', null)
    insert.run('/m/d.wav', 85)
  })

  const export1 = collection(rb('/m/a.wav', 160), rb('/m/b.wav', 140.004), rb('/m/c.wav', 128.5), rb('/m/d.wav', null), rb('/elsewhere.wav', 120))

  it("takes Rekordbox's tempo where MCO has none or another, and keeps it through analysis", () => {
    expect(importRekordboxBpm(db, export1, trackMatcher(db))).toEqual({ songs: 2 })
    expect(bpms()).toEqual([
      { path: '/m/a.wav', bpm: 160, bpm_edited: 1 },
      { path: '/m/b.wav', bpm: 140, bpm_edited: 0 },
      { path: '/m/c.wav', bpm: 128.5, bpm_edited: 1 },
      { path: '/m/d.wav', bpm: 85, bpm_edited: 0 },
    ])
    // Again: nothing left to change.
    expect(importRekordboxBpm(db, export1, trackMatcher(db))).toEqual({ songs: 0 })
  })

  it('reaches a song confirmed at another path, playlists imported or not', () => {
    const stick = collection(rb('/Volumes/USB/Contents/a.wav', 160))
    expect(importRekordboxBpm(db, stick, trackMatcher(db))).toEqual({ songs: 0 })
    const a = (db.prepare("SELECT id FROM tracks WHERE path = '/m/a.wav'").get() as { id: number }).id
    rememberPathAliases(db, [{ from: '/Volumes/USB/Contents/a.wav', trackId: a }])
    expect(importRekordboxBpm(db, stick, trackMatcher(db))).toEqual({ songs: 1 })
    expect(bpms()[0]).toEqual({ path: '/m/a.wav', bpm: 160, bpm_edited: 1 })
  })

  it('only counts on a dry run', () => {
    expect(importRekordboxBpm(db, export1, trackMatcher(db), false)).toEqual({ songs: 2 })
    expect(bpms().every((t) => t.bpm_edited === 0)).toBe(true)
    expect(bpms()[0].bpm).toBe(106.58)
  })
})

describe('importRekordboxCues, dry run', () => {
  it('counts what it would bring without writing', () => {
    const db = openDatabase(':memory:')
    db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/m/a.wav', 'a.wav', '/m', 'wav', 1, 1)`).run()
    const cues = [{ num: 0, type: 0, start: 1.5, end: null, color: null, name: '' }] as unknown as RekordboxTrack['cues']
    const data = collection(rb('/m/a.wav', 140, cues))
    expect(importRekordboxCues(db, data, trackMatcher(db), false)).toEqual({ songs: 1, cues: 1, skipped: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM track_cues').get()).toEqual({ n: 0 })
    expect(importRekordboxCues(db, data, trackMatcher(db))).toEqual({ songs: 1, cues: 1, skipped: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM track_cues').get()).toEqual({ n: 1 })
  })
})

describe('importRekordboxCues, a song that already has cues', () => {
  const cue = (num: number, start: number, type = 0) => ({ num, type, start, end: null, color: null, name: '' })
  const hot = (db: AppDatabase) => db.prepare("SELECT slot, start FROM track_cues WHERE kind = 'hot' ORDER BY slot").all() as { slot: number; start: number }[]

  it('keeps its cues and fills only its empty pads', () => {
    const db = openDatabase(':memory:')
    const id = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/m/a.wav', 'a.wav', '/m', 'wav', 1, 1)`).run().lastInsertRowid as number
    db.prepare("INSERT INTO track_cues (track_id, kind, slot, start, end, color, name) VALUES (?, 'hot', 0, 10, NULL, NULL, 'Mine')").run(id)
    const cues = [cue(0, 99), cue(1, 20), cue(2, 10.02), cue(3, 40), cue(-1, 55), cue(4, 60, 4)] as unknown as RekordboxTrack['cues']
    const data = collection(rb('/m/a.wav', 140, cues))
    // A: MCO's pad is kept. B: empty, filled. C: the same moment as MCO's A, left out. D: filled.
    // The memory cue and the loop are not added to a song that has cues.
    expect(importRekordboxCues(db, data, trackMatcher(db), false)).toEqual({ songs: 1, cues: 2, skipped: 0 })
    expect(importRekordboxCues(db, data, trackMatcher(db))).toEqual({ songs: 1, cues: 2, skipped: 0 })
    expect(hot(db)).toEqual([{ slot: 0, start: 10 }, { slot: 1, start: 20 }, { slot: 3, start: 40 }])
    expect(db.prepare("SELECT COUNT(*) AS n FROM track_cues WHERE kind != 'hot'").get()).toEqual({ n: 0 })
    // Again: nothing left to add.
    expect(importRekordboxCues(db, data, trackMatcher(db))).toEqual({ songs: 0, cues: 0, skipped: 1 })
    expect(hot(db)).toHaveLength(3)
  })
})

