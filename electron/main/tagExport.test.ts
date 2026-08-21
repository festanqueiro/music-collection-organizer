import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { createGenre, createSubgenre, createMood, setTrackGenres, setTrackSubgenres, setTrackMoods } from './tags'
import { exportTagData } from './tagExport'

describe('exportTagData', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('exports the full genre/subgenre/mood catalog by name', () => {
    const houseId = createGenre(db, 'House')
    createSubgenre(db, 'Deep House', houseId)
    createMood(db, 'Energetic')

    const data = exportTagData(db)

    expect(data.version).toBe(1)
    expect(data.genres).toEqual([{ name: 'House' }])
    expect(data.subgenres).toEqual([{ name: 'Deep House', genreName: 'House' }])
    expect(data.moods).toEqual([{ name: 'Energetic' }])
  })

  it('exports each tagged track by path with its tag names', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const energeticId = createMood(db, 'Energetic')
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])
    setTrackMoods(db, trackId, [energeticId])

    const data = exportTagData(db)

    expect(data.tracks).toEqual([
      {
        path: '/a.wav',
        genres: ['House'],
        subgenres: [{ name: 'Deep House', genreName: 'House' }],
        moods: ['Energetic'],
      },
    ])
  })

  it('omits untagged tracks from the tracks list', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/untagged.wav','untagged.wav','/', 'wav', 1, 1)`
    ).run()

    const data = exportTagData(db)

    expect(data.tracks).toEqual([])
  })

  it('does not produce a cartesian product when a track has multiple tags of different kinds', () => {
    const houseId = createGenre(db, 'House')
    const technoId = createGenre(db, 'Techno')
    const energeticId = createMood(db, 'Energetic')
    const darkId = createMood(db, 'Dark')
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/b.wav','b.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId, technoId])
    setTrackMoods(db, trackId, [energeticId, darkId])

    const data = exportTagData(db)

    expect(data.tracks).toHaveLength(1)
    expect(data.tracks[0].genres.sort()).toEqual(['House', 'Techno'])
    expect(data.tracks[0].moods.sort()).toEqual(['Dark', 'Energetic'])
  })
})
