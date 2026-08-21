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

export interface GenreDeletionSnapshot {
  genreName: string
  subgenres: { name: string }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]>
}

// Reads everything deleteGenre's cascade delete is about to destroy —
// called before deleteGenre, not after.
export function captureGenreDeletionSnapshot(db: AppDatabase, genreId: number): GenreDeletionSnapshot {
  const genre = db.prepare('SELECT name FROM genres WHERE id = ?').get(genreId) as { name: string } | undefined
  if (!genre) throw new Error(`No genre with id ${genreId}`)

  const subgenreRows = db.prepare('SELECT id, name FROM subgenres WHERE genre_id = ?').all(genreId) as {
    id: number
    name: string
  }[]

  const trackGenreRows = db.prepare('SELECT track_id FROM track_genres WHERE genre_id = ?').all(genreId) as {
    track_id: number
  }[]

  const trackSubgenreAssociationsByName: Record<string, number[]> = {}
  for (const sg of subgenreRows) {
    const rows = db.prepare('SELECT track_id FROM track_subgenres WHERE subgenre_id = ?').all(sg.id) as {
      track_id: number
    }[]
    trackSubgenreAssociationsByName[sg.name] = rows.map((r) => r.track_id)
  }

  return {
    genreName: genre.name,
    subgenres: subgenreRows.map((s) => ({ name: s.name })),
    trackGenreAssociations: trackGenreRows.map((r) => ({ trackId: r.track_id })),
    trackSubgenreAssociationsByName,
  }
}

// Recreates the genre and sub-genres with NEW ids (the old ones are gone —
// nothing else references them) and re-applies the captured track
// associations against those new ids.
export function undoGenreDeletion(db: AppDatabase, snapshot: GenreDeletionSnapshot): void {
  runInTransaction(db, () => {
    const newGenreId = createGenre(db, snapshot.genreName)
    for (const { trackId } of snapshot.trackGenreAssociations) {
      db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, newGenreId)
    }
    for (const sg of snapshot.subgenres) {
      const newSubgenreId = createSubgenre(db, sg.name, newGenreId)
      const trackIds = snapshot.trackSubgenreAssociationsByName[sg.name] ?? []
      for (const trackId of trackIds) {
        db.prepare('INSERT INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(trackId, newSubgenreId)
      }
    }
  })
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

// Called after every single tag-checkbox toggle (see ipc.ts's
// tags:setTrackGenres/Subgenres/Moods handlers) — one UNION ALL query
// instead of three separate round trips, same pattern as ipc.ts's
// tracks:getAllTagIds already uses for the whole-collection version.
export function getTrackTagIds(
  db: AppDatabase,
  trackId: number
): { genreIds: number[]; subgenreIds: number[]; moodIds: number[] } {
  const rows = db
    .prepare(
      `SELECT genre_id, NULL as subgenre_id, NULL as mood_id FROM track_genres WHERE track_id = ?
       UNION ALL
       SELECT NULL, subgenre_id, NULL FROM track_subgenres WHERE track_id = ?
       UNION ALL
       SELECT NULL, NULL, mood_id FROM track_moods WHERE track_id = ?`
    )
    .all(trackId, trackId, trackId) as { genre_id: number | null; subgenre_id: number | null; mood_id: number | null }[]

  const genreIds: number[] = []
  const subgenreIds: number[] = []
  const moodIds: number[] = []
  for (const row of rows) {
    if (row.genre_id) genreIds.push(row.genre_id)
    if (row.subgenre_id) subgenreIds.push(row.subgenre_id)
    if (row.mood_id) moodIds.push(row.mood_id)
  }
  return { genreIds, subgenreIds, moodIds }
}

export function addGenresToTracks(db: AppDatabase, trackIds: number[], genreIds: number[]): void {
  runInTransaction(db, () => {
    for (const trackId of trackIds) {
      for (const genreId of genreIds) {
        db.prepare('INSERT OR IGNORE INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)
      }
    }
  })
}

// Sub-genre tags only make sense alongside their parent genre (see
// setTrackGenres, which prunes track_subgenres rows when the parent genre is
// removed) — so adding a subgenre here must also ensure the parent genre is
// associated with the track, or the association would be an invisible
// orphan until the next genre edit silently deletes it.
export function addSubgenresToTracks(db: AppDatabase, trackIds: number[], subgenreIds: number[]): void {
  if (subgenreIds.length === 0 || trackIds.length === 0) return
  runInTransaction(db, () => {
    const placeholders = subgenreIds.map(() => '?').join(', ')
    const subgenreRows = db
      .prepare(`SELECT id, genre_id FROM subgenres WHERE id IN (${placeholders})`)
      .all(...subgenreIds) as { id: number; genre_id: number }[]
    const genreIdBySubgenreId = new Map(subgenreRows.map((r) => [r.id, r.genre_id]))

    for (const trackId of trackIds) {
      for (const subgenreId of subgenreIds) {
        const genreId = genreIdBySubgenreId.get(subgenreId)
        if (genreId !== undefined) {
          db.prepare('INSERT OR IGNORE INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)
        }
        db.prepare('INSERT OR IGNORE INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(
          trackId,
          subgenreId
        )
      }
    }
  })
}

export function addMoodsToTracks(db: AppDatabase, trackIds: number[], moodIds: number[]): void {
  runInTransaction(db, () => {
    for (const trackId of trackIds) {
      for (const moodId of moodIds) {
        db.prepare('INSERT OR IGNORE INTO track_moods (track_id, mood_id) VALUES (?, ?)').run(trackId, moodId)
      }
    }
  })
}
