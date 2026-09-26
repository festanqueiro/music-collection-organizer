import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import {
  createGenre,
  createSubgenre,
  deleteGenre,
  deleteSubgenre,
  renameGenre,
  renameSubgenre,
  setGenreColor,
  setSubgenreColor,
  countTracksWithGenre,
  countTracksWithSubgenre,
  setTrackGenres,
  setTrackSubgenres,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  captureGenreDeletionSnapshot,
  undoGenreDeletion,
  captureSubgenreDeletionSnapshot,
  undoSubgenreDeletion,
} from './tags'
import { TAG_COLORS } from '../../src/tagColors'

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

  it('creates genres, subgenres and tags a track', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    expect(getTrackTagIds(db, trackId)).toEqual({
      genreIds: [houseId],
      subgenreIds: [deepHouseId],
    })
  })

  it('gives each new genre the next palette colour', () => {
    const colorOf = (id: number) => (db.prepare('SELECT color FROM genres WHERE id = ?').get(id) as { color: string | null }).color
    const house = createGenre(db, 'House')
    const dub = createGenre(db, 'Dub')
    expect([colorOf(house), colorOf(dub)]).toEqual([TAG_COLORS[0], TAG_COLORS[1]])
    // A recoloured genre frees its palette colour for the next one.
    setGenreColor(db, house, '#123456')
    expect(colorOf(createGenre(db, 'Techno'))).toBe(TAG_COLORS[0])
    expect(colorOf(createGenre(db, 'Plain', null))).toBeNull()
  })

  it('gives sub-genres their own colour, kept through delete and undo', () => {
    const colorOf = (id: number) =>
      (db.prepare('SELECT color FROM subgenres WHERE id = ?').get(id) as { color: string | null }).color
    const dub = createGenre(db, 'Dub')
    const steppers = createSubgenre(db, 'Steppers', dub)
    expect(colorOf(steppers)).toBe(TAG_COLORS[0])
    expect(colorOf(createSubgenre(db, 'Roots', dub))).toBe(TAG_COLORS[1])
    setSubgenreColor(db, steppers, '#abcdef')
    const snapshot = captureSubgenreDeletionSnapshot(db, steppers)
    deleteSubgenre(db, steppers)
    undoSubgenreDeletion(db, snapshot)
    expect(db.prepare("SELECT color FROM subgenres WHERE name = 'Steppers'").get()).toEqual({ color: '#abcdef' })
    // …and through the parent genre's delete and undo.
    const genreSnapshot = captureGenreDeletionSnapshot(db, dub)
    deleteGenre(db, dub)
    undoGenreDeletion(db, genreSnapshot)
    expect(db.prepare("SELECT color FROM subgenres WHERE name = 'Steppers'").get()).toEqual({ color: '#abcdef' })
  })

  it('keeps the colour when a genre deletion is undone', () => {
    const house = createGenre(db, 'House')
    setGenreColor(db, house, '#123456')
    const snapshot = captureGenreDeletionSnapshot(db, house)
    deleteGenre(db, house)
    undoGenreDeletion(db, snapshot)
    expect(db.prepare("SELECT color FROM genres WHERE name = 'House'").get()).toEqual({ color: '#123456' })
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

  it('addSubgenresToTracks also associates the sub-genre\'s parent genre with the track', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)

    addSubgenresToTracks(db, [trackId], [deepHouseId])

    expect(getTrackTagIds(db, trackId).genreIds).toEqual([houseId])
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([deepHouseId])
  })

  it('captureGenreDeletionSnapshot records the genre, its sub-genres, and every track association', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const snapshot = captureGenreDeletionSnapshot(db, houseId)

    expect(snapshot.genreName).toBe('House')
    expect(snapshot.subgenres).toEqual([{ name: 'Deep House', color: TAG_COLORS[0] }])
    expect(snapshot.trackGenreAssociations).toEqual([{ trackId }])
    expect(snapshot.trackSubgenreAssociationsByName).toEqual({ 'Deep House': [trackId] })
  })

  it('undoGenreDeletion recreates the genre, sub-genres, and track associations after a real delete', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const snapshot = captureGenreDeletionSnapshot(db, houseId)
    deleteGenre(db, houseId)
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([])

    undoGenreDeletion(db, snapshot)

    const genres = db.prepare('SELECT name FROM genres').all()
    expect(genres).toEqual([{ name: 'House' }])
    const restoredGenreId = (db.prepare('SELECT id FROM genres WHERE name = ?').get('House') as { id: number }).id
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([restoredGenreId])
    const restoredSubgenreId = (
      db.prepare('SELECT id FROM subgenres WHERE name = ?').get('Deep House') as { id: number }
    ).id
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([restoredSubgenreId])
  })

  it('renameGenre updates the name in place, keeping the same id and associations', () => {
    const houseId = createGenre(db, 'House')
    setTrackGenres(db, trackId, [houseId])

    renameGenre(db, houseId, 'Deep House')

    const genre = db.prepare('SELECT name FROM genres WHERE id = ?').get(houseId) as { name: string }
    expect(genre.name).toBe('Deep House')
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([houseId])
  })

  it('renameSubgenre updates the name in place, keeping the same id and associations', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackSubgenres(db, trackId, [deepHouseId])

    renameSubgenre(db, deepHouseId, 'Deeper House')

    const subgenre = db.prepare('SELECT name FROM subgenres WHERE id = ?').get(deepHouseId) as { name: string }
    expect(subgenre.name).toBe('Deeper House')
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([deepHouseId])
  })

  it('setGenreColor stores and clears a color', () => {
    const houseId = createGenre(db, 'House')
    setGenreColor(db, houseId, '#3b82f6')
    expect((db.prepare('SELECT color FROM genres WHERE id = ?').get(houseId) as { color: string }).color).toBe(
      '#3b82f6'
    )
    setGenreColor(db, houseId, null)
    expect((db.prepare('SELECT color FROM genres WHERE id = ?').get(houseId) as { color: string | null }).color).toBe(
      null
    )
  })

  it('countTracksWithGenre/Subgenre counts direct associations only', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    expect(countTracksWithGenre(db, houseId)).toBe(1)
    expect(countTracksWithSubgenre(db, deepHouseId)).toBe(1)
  })

  it('captureSubgenreDeletionSnapshot + undoSubgenreDeletion restores a deleted sub-genre and its associations', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const snapshot = captureSubgenreDeletionSnapshot(db, deepHouseId)
    deleteSubgenre(db, deepHouseId)
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([])

    undoSubgenreDeletion(db, snapshot)

    const restoredSubgenreId = (
      db.prepare('SELECT id FROM subgenres WHERE name = ?').get('Deep House') as { id: number }
    ).id
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([restoredSubgenreId])
    // Deleting a sub-genre never touches the parent genre's own association.
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([houseId])
  })
})
