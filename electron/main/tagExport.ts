import type { AppDatabase } from './db'
import { runInTransaction } from './db'
import { createGenre, createSubgenre, addGenresToTracks, addSubgenresToTracks } from './tags'

export interface TagExportData {
  version: 1
  genres: { name: string }[]
  subgenres: { name: string; genreName: string }[]
  tracks: {
    path: string
    genres: string[]
    subgenres: { name: string; genreName: string }[]
  }[]
}

export function exportTagData(db: AppDatabase): TagExportData {
  const genres = db.prepare('SELECT name FROM genres').all() as { name: string }[]
  const subgenres = db
    .prepare(`SELECT s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
    .all() as { name: string; genre_name: string }[]

  const trackPaths = db.prepare('SELECT id, path FROM tracks').all() as { id: number; path: string }[]
  const pathById = new Map(trackPaths.map((t) => [t.id, t.path]))

  // Two separate queries (not one multi-join) — joining track_genres and
  // track_subgenres together in one query would produce a cartesian
  // product across the two independent one-to-many relations for any
  // track with more than one tag of more than one kind.
  const genreRows = db
    .prepare(`SELECT tg.track_id as track_id, g.name as name FROM track_genres tg JOIN genres g ON g.id = tg.genre_id`)
    .all() as { track_id: number; name: string }[]
  const subgenreRows = db
    .prepare(
      `SELECT tsg.track_id as track_id, s.name as name, g.name as genre_name
       FROM track_subgenres tsg
       JOIN subgenres s ON s.id = tsg.subgenre_id
       JOIN genres g ON g.id = s.genre_id`
    )
    .all() as { track_id: number; name: string; genre_name: string }[]

  const byTrack = new Map<number, { genres: string[]; subgenres: { name: string; genreName: string }[] }>()
  function entry(trackId: number) {
    if (!byTrack.has(trackId)) byTrack.set(trackId, { genres: [], subgenres: [] })
    return byTrack.get(trackId)!
  }
  for (const row of genreRows) entry(row.track_id).genres.push(row.name)
  for (const row of subgenreRows) entry(row.track_id).subgenres.push({ name: row.name, genreName: row.genre_name })

  const tracks = Array.from(byTrack.entries())
    .filter(([trackId]) => pathById.has(trackId))
    .map(([trackId, tags]) => ({ path: pathById.get(trackId)!, ...tags }))

  return {
    version: 1,
    genres,
    subgenres: subgenres.map((s) => ({ name: s.name, genreName: s.genre_name })),
    tracks,
  }
}

export interface ImportResult {
  matchedTracks: number
  skippedTracks: number
}

export function importTagData(db: AppDatabase, data: TagExportData): ImportResult {
  return runInTransaction(db, () => {
    const genreIdByName = new Map<string, number>()
    for (const row of db.prepare('SELECT id, name FROM genres').all() as { id: number; name: string }[]) {
      genreIdByName.set(row.name, row.id)
    }
    for (const g of data.genres) {
      if (!genreIdByName.has(g.name)) {
        genreIdByName.set(g.name, createGenre(db, g.name))
      }
    }

    // Keyed by "genreName::subgenreName" — subgenres.name has no uniqueness
    // constraint in the schema, so two different genres can have same-named
    // sub-genres and must not be merged.
    const subgenreIdByKey = new Map<string, number>()
    for (const row of db
      .prepare(`SELECT s.id as id, s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
      .all() as { id: number; name: string; genre_name: string }[]) {
      subgenreIdByKey.set(`${row.genre_name}::${row.name}`, row.id)
    }
    for (const sg of data.subgenres) {
      const key = `${sg.genreName}::${sg.name}`
      if (!subgenreIdByKey.has(key)) {
        const genreId = genreIdByName.get(sg.genreName)
        if (genreId !== undefined) {
          subgenreIdByKey.set(key, createSubgenre(db, sg.name, genreId))
        }
      }
    }

    let matchedTracks = 0
    let skippedTracks = 0
    for (const t of data.tracks) {
      const row = db.prepare('SELECT id FROM tracks WHERE path = ?').get(t.path) as { id: number } | undefined
      if (!row) {
        skippedTracks++
        continue
      }
      matchedTracks++

      const genreIds = t.genres
        .map((name) => genreIdByName.get(name))
        .filter((id): id is number => id !== undefined)
      const subgenreIds = t.subgenres
        .map((sg) => subgenreIdByKey.get(`${sg.genreName}::${sg.name}`))
        .filter((id): id is number => id !== undefined)

      if (genreIds.length) addGenresToTracks(db, [row.id], genreIds)
      if (subgenreIds.length) addSubgenresToTracks(db, [row.id], subgenreIds)
    }

    return { matchedTracks, skippedTracks }
  })
}
