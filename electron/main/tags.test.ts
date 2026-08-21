import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
} from './tags'

describe('tags', () => {
  let db: AppDatabase
  let trackId: number

  beforeEach(() => {
    db = openDatabase(':memory:')
    trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number
  })

  it('creates genres, subgenres, moods and tags a track', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const energeticId = createMood(db, 'Energetic')

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])
    setTrackMoods(db, trackId, [energeticId])

    expect(getTrackTagIds(db, trackId)).toEqual({
      genreIds: [houseId],
      subgenreIds: [deepHouseId],
      moodIds: [energeticId],
    })
  })

  it('auto-removes orphaned subgenre tags when parent genre is unassigned', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    setTrackGenres(db, trackId, []) // unassign House

    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([])
  })

  it('cascades subgenre deletion when a genre is deleted', () => {
    const houseId = createGenre(db, 'House')
    createSubgenre(db, 'Deep House', houseId)
    deleteGenre(db, houseId)
    const remaining = db.prepare('SELECT * FROM subgenres').all()
    expect(remaining).toEqual([])
  })

  it('addGenresToTracks adds a genre to multiple tracks without touching their other tags', () => {
    const houseId = createGenre(db, 'House')
    const technoId = createGenre(db, 'Techno')
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/b.wav','b.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [technoId]) // pre-existing tag that should survive

    addGenresToTracks(db, [trackId, track2Id], [houseId])

    expect(getTrackTagIds(db, trackId).genreIds.sort()).toEqual([houseId, technoId].sort())
    expect(getTrackTagIds(db, track2Id).genreIds).toEqual([houseId])
  })

  it('addGenresToTracks is a harmless no-op when the track already has the genre', () => {
    const houseId = createGenre(db, 'House')
    setTrackGenres(db, trackId, [houseId])

    expect(() => addGenresToTracks(db, [trackId], [houseId])).not.toThrow()
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([houseId])
  })

  it('addSubgenresToTracks adds a sub-genre to multiple tracks', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/c.wav','c.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    addSubgenresToTracks(db, [trackId, track2Id], [deepHouseId])

    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([deepHouseId])
    expect(getTrackTagIds(db, track2Id).subgenreIds).toEqual([deepHouseId])
  })

  it('addMoodsToTracks adds a mood to multiple tracks', () => {
    const energeticId = createMood(db, 'Energetic')
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/d.wav','d.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    addMoodsToTracks(db, [trackId, track2Id], [energeticId])

    expect(getTrackTagIds(db, trackId).moodIds).toEqual([energeticId])
    expect(getTrackTagIds(db, track2Id).moodIds).toEqual([energeticId])
  })
})
