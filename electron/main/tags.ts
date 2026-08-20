import { runInTransaction, type AppDatabase } from './db'

export function createGenre(db: AppDatabase, name: string): number {
  return db.prepare('INSERT INTO genres (name) VALUES (?)').run(name).lastInsertRowid as number
}

export function createSubgenre(db: AppDatabase, name: string, genreId: number): number {
  return db
    .prepare('INSERT INTO subgenres (name, genre_id) VALUES (?, ?)')
    .run(name, genreId).lastInsertRowid as number
}

export function createMood(db: AppDatabase, name: string): number {
  return db.prepare('INSERT INTO moods (name) VALUES (?)').run(name).lastInsertRowid as number
}

export function deleteGenre(db: AppDatabase, genreId: number): void {
  db.prepare('DELETE FROM genres WHERE id = ?').run(genreId)
}

export function setTrackGenres(db: AppDatabase, trackId: number, genreIds: number[]): void {
  runInTransaction(db, () => {
    db.prepare('DELETE FROM track_genres WHERE track_id = ?').run(trackId)
    for (const genreId of genreIds) {
      db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)
    }

    const keptGenreIds = new Set(genreIds)
    const trackSubgenres = db
      .prepare(
        `SELECT s.id as subgenre_id, s.genre_id as genre_id
         FROM track_subgenres ts JOIN subgenres s ON s.id = ts.subgenre_id
         WHERE ts.track_id = ?`
      )
      .all(trackId) as { subgenre_id: number; genre_id: number }[]

    for (const row of trackSubgenres) {
      if (!keptGenreIds.has(row.genre_id)) {
        db.prepare('DELETE FROM track_subgenres WHERE track_id = ? AND subgenre_id = ?').run(
          trackId,
          row.subgenre_id
        )
      }
    }
  })
}

export function setTrackSubgenres(db: AppDatabase, trackId: number, subgenreIds: number[]): void {
  runInTransaction(db, () => {
    db.prepare('DELETE FROM track_subgenres WHERE track_id = ?').run(trackId)
    for (const subgenreId of subgenreIds) {
      db.prepare('INSERT INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(trackId, subgenreId)
    }
  })
}

export function setTrackMoods(db: AppDatabase, trackId: number, moodIds: number[]): void {
  runInTransaction(db, () => {
    db.prepare('DELETE FROM track_moods WHERE track_id = ?').run(trackId)
    for (const moodId of moodIds) {
      db.prepare('INSERT INTO track_moods (track_id, mood_id) VALUES (?, ?)').run(trackId, moodId)
    }
  })
}

export function getTrackTagIds(
  db: AppDatabase,
  trackId: number
): { genreIds: number[]; subgenreIds: number[]; moodIds: number[] } {
  const genreIds = (db.prepare('SELECT genre_id FROM track_genres WHERE track_id = ?').all(trackId) as any[]).map(
    (r) => r.genre_id
  )
  const subgenreIds = (
    db.prepare('SELECT subgenre_id FROM track_subgenres WHERE track_id = ?').all(trackId) as any[]
  ).map((r) => r.subgenre_id)
  const moodIds = (db.prepare('SELECT mood_id FROM track_moods WHERE track_id = ?').all(trackId) as any[]).map(
    (r) => r.mood_id
  )
  return { genreIds, subgenreIds, moodIds }
}
