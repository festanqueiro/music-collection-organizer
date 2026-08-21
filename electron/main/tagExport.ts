import type { AppDatabase } from './db'

export interface TagExportData {
  version: 1
  genres: { name: string }[]
  subgenres: { name: string; genreName: string }[]
  moods: { name: string }[]
  tracks: {
    path: string
    genres: string[]
    subgenres: { name: string; genreName: string }[]
    moods: string[]
  }[]
}

export function exportTagData(db: AppDatabase): TagExportData {
  const genres = db.prepare('SELECT name FROM genres').all() as { name: string }[]
  const subgenres = db
    .prepare(`SELECT s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
    .all() as { name: string; genre_name: string }[]
  const moods = db.prepare('SELECT name FROM moods').all() as { name: string }[]

  const trackPaths = db.prepare('SELECT id, path FROM tracks').all() as { id: number; path: string }[]
  const pathById = new Map(trackPaths.map((t) => [t.id, t.path]))

  // Three separate queries (not one multi-join) — joining track_genres,
  // track_subgenres, and track_moods together in one query would produce a
  // cartesian product across the three independent one-to-many relations
  // for any track with more than one tag of more than one kind.
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
  const moodRows = db
    .prepare(`SELECT tm.track_id as track_id, m.name as name FROM track_moods tm JOIN moods m ON m.id = tm.mood_id`)
    .all() as { track_id: number; name: string }[]

  const byTrack = new Map<
    number,
    { genres: string[]; subgenres: { name: string; genreName: string }[]; moods: string[] }
  >()
  function entry(trackId: number) {
    if (!byTrack.has(trackId)) byTrack.set(trackId, { genres: [], subgenres: [], moods: [] })
    return byTrack.get(trackId)!
  }
  for (const row of genreRows) entry(row.track_id).genres.push(row.name)
  for (const row of subgenreRows) entry(row.track_id).subgenres.push({ name: row.name, genreName: row.genre_name })
  for (const row of moodRows) entry(row.track_id).moods.push(row.name)

  const tracks = Array.from(byTrack.entries())
    .filter(([trackId]) => pathById.has(trackId))
    .map(([trackId, tags]) => ({ path: pathById.get(trackId)!, ...tags }))

  return {
    version: 1,
    genres,
    subgenres: subgenres.map((s) => ({ name: s.name, genreName: s.genre_name })),
    moods,
    tracks,
  }
}
