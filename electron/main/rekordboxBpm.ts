// Rekordbox's tempos → MCO (docs/features/playlists.md, "What to import"):
// for songs MCO has (matched by path) whose BPM is missing or differs from
// Rekordbox's. The tempo becomes the user's (`bpm_edited`, as Refine BPM
// does), so a later analysis doesn't put MCO's own back. With `write` off
// nothing is written: the count, for the import's summary.
import { runInTransaction, type AppDatabase } from './db'
import type { RekordboxCollection } from './rekordboxXml'

// Closer than this is the same tempo (Rekordbox keeps two decimals).
const SAME_BPM = 0.05

export function importRekordboxBpm(
  db: AppDatabase,
  collection: RekordboxCollection,
  match: (path: string) => number | undefined,
  write = true
): { songs: number } {
  return runInTransaction(db, () => {
    const current = db.prepare('SELECT bpm FROM tracks WHERE id = ?')
    const update = db.prepare('UPDATE tracks SET bpm = ?, bpm_edited = 1 WHERE id = ?')
    let songs = 0
    const done = new Set<number>()
    for (const t of collection.tracks) {
      if (!t.bpm || !(t.bpm > 0)) continue
      const id = match(t.path)
      if (id === undefined || done.has(id)) continue
      const row = current.get(id) as { bpm: number | null } | undefined
      if (!row) continue
      done.add(id)
      const bpm = Math.round(t.bpm * 100) / 100
      if (row.bpm !== null && Math.abs(row.bpm - bpm) < SAME_BPM) continue
      if (write) update.run(bpm, id)
      songs++
    }
    return { songs }
  })
}
