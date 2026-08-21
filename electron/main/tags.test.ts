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
})
