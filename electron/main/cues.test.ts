import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { getTrackCues, setHotCue, updateHotCue, deleteHotCue, getHotCueCounts, importRekordboxCues } from './cues'
import { trackMatcher } from './playlists'
import type { RekordboxCollection } from './rekordboxXml'

describe('cues', () => {
  let db: AppDatabase
  let a: number
  let b: number
  beforeEach(() => {
    db = openDatabase(':memory:')
    const insert = db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, ?, '/m', 'aiff', 1, 1)`)
    a = insert.run('/m/a.aiff', 'a.aiff').lastInsertRowid as number
    b = insert.run('/m/b.aiff', 'b.aiff').lastInsertRowid as number
  })

  it('sets, moves, recolours, renames and deletes hot cues', () => {
    setHotCue(db, a, 0, 12.3456)
    setHotCue(db, a, 2, 4)
    updateHotCue(db, a, 0, { color: '#45acdb', name: ' Drop ' })
    expect(setHotCue(db, a, 0, 30).map((c) => [c.slot, c.start, c.color, c.name])).toEqual([
      [2, 4, null, ''],
      [0, 30, '#45acdb', 'Drop'],
    ])
    expect(getHotCueCounts(db)).toEqual({ [a]: 2 })
    expect(deleteHotCue(db, a, 2).map((c) => c.slot)).toEqual([0])
    expect(() => setHotCue(db, a, 8, 1)).toThrow()
    expect(() => updateHotCue(db, a, 0, { color: 'red' })).toThrow()
  })

  it('goes when the track does', () => {
    setHotCue(db, a, 0, 1)
    db.prepare('DELETE FROM tracks WHERE id = ?').run(a)
    expect(getTrackCues(db, a)).toEqual([])
  })

  it("brings Rekordbox's cues in: all of them for a song with none, the empty pads of one with cues", () => {
    setHotCue(db, b, 0, 5)
    const collection: RekordboxCollection = {
      version: '7',
      tree: [],
      tracks: [
        { trackId: '1', path: '/m/a.aiff', name: '', artist: '', album: '', genre: '', comments: '', year: null, bpm: null, tonality: '', seconds: 200,
          cues: [
            { num: 0, type: 0, start: 28.849, color: [255, 55, 111] },
            { num: 2, type: 0, start: 56.675, color: [125, 193, 61] },
            { num: -1, type: 0, start: 2, color: null },
            { num: -1, type: 4, start: 60, end: 64, color: null },
          ] },
        { trackId: '2', path: '/m/b.aiff', name: '', artist: '', album: '', genre: '', comments: '', year: null, bpm: null, tonality: '', seconds: 200,
          cues: [{ num: 1, type: 0, start: 9, color: null }] },
        { trackId: '3', path: '/elsewhere.aiff', name: '', artist: '', album: '', genre: '', comments: '', year: null, bpm: null, tonality: '', seconds: 200,
          cues: [{ num: 1, type: 0, start: 9, color: null }] },
      ],
    }
    expect(importRekordboxCues(db, collection, trackMatcher(db))).toEqual({ songs: 2, cues: 5, skipped: 0 })
    expect(getTrackCues(db, a).map((c) => [c.kind, c.slot, c.start, c.end, c.color])).toEqual([
      ['memory', -1, 2, null, null],
      ['hot', 0, 28.849, null, '#ff376f'],
      ['hot', 2, 56.675, null, '#7dc13d'],
      ['loop', -1, 60, 64, null],
    ])
    // b kept its own cue on pad A, and its empty pad B took Rekordbox's.
    expect(getTrackCues(db, b).map((c) => [c.slot, c.start])).toEqual([[0, 5], [1, 9]])
  })
})
