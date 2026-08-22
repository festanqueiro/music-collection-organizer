import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { createGenre, createSubgenre, setTrackGenres, setTrackSubgenres, getTrackTagIds } from './tags'
import { exportTagData, importTagData } from './tagExport'

describe('exportTagData', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('exports the full genre/subgenre catalog by name', () => {
    const houseId = createGenre(db, 'House')
    createSubgenre(db, 'Deep House', houseId)

    const data = exportTagData(db)

    expect(data.version).toBe(1)
    expect(data.genres).toEqual([{ name: 'House' }])
    expect(data.subgenres).toEqual([{ name: 'Deep House', genreName: 'House' }])
  })

  it('exports each tagged track by path with its tag names', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const data = exportTagData(db)

    expect(data.tracks).toEqual([
      {
        path: '/a.wav',
        genres: ['House'],
        subgenres: [{ name: 'Deep House', genreName: 'House' }],
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

  it('does not produce a cartesian product when a track has multiple genres and sub-genres', () => {
    const houseId = createGenre(db, 'House')
    const technoId = createGenre(db, 'Techno')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/b.wav','b.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId, technoId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const data = exportTagData(db)

    expect(data.tracks).toHaveLength(1)
    expect(data.tracks[0].genres.sort()).toEqual(['House', 'Techno'])
    expect(data.tracks[0].subgenres).toEqual([{ name: 'Deep House', genreName: 'House' }])
  })
})

describe('importTagData', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('creates missing genres/subgenres and tags matched tracks', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()

    const result = importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [{ name: 'Deep House', genreName: 'House' }],
      tracks: [
        {
          path: '/a.wav',
          genres: ['House'],
          subgenres: [{ name: 'Deep House', genreName: 'House' }],
        },
      ],
    })

    expect(result).toEqual({ matchedTracks: 1, skippedTracks: 0 })

    const genres = db.prepare('SELECT name FROM genres').all()
    expect(genres).toEqual([{ name: 'House' }])
  })

  it('skips and counts tracks whose path is not in the local collection', () => {
    const result = importTagData(db, {
      version: 1,
      genres: [],
      subgenres: [],
      tracks: [{ path: '/does-not-exist.wav', genres: [], subgenres: [] }],
    })

    expect(result).toEqual({ matchedTracks: 0, skippedTracks: 1 })
  })

  it('is additive — does not remove a track\'s existing tags', () => {
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number
    const technoId = createGenre(db, 'Techno')
    setTrackGenres(db, trackId, [technoId])

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [],
      tracks: [{ path: '/a.wav', genres: ['House'], subgenres: [] }],
    })

    expect(getTrackTagIds(db, trackId).genreIds.length).toBe(2)
  })

  it('reuses an existing genre by name instead of creating a duplicate', () => {
    const houseId = createGenre(db, 'House')

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [],
      tracks: [],
    })

    const genres = db.prepare('SELECT id FROM genres').all() as { id: number }[]
    expect(genres).toEqual([{ id: houseId }])
  })

  it('does not confuse two different genres that have same-named sub-genres', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }, { name: 'Techno' }],
      subgenres: [
        { name: 'Deep', genreName: 'House' },
        { name: 'Deep', genreName: 'Techno' },
      ],
      tracks: [
        {
          path: '/a.wav',
          genres: [],
          subgenres: [{ name: 'Deep', genreName: 'House' }],
        },
      ],
    })

    const subgenres = db
      .prepare(`SELECT s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
      .all()
    expect(subgenres).toHaveLength(2) // both "Deep" sub-genres created, not merged
  })
})
