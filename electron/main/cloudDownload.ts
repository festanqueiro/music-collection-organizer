import { readFile } from 'node:fs/promises'
import type { AppDatabase } from './db'
import { analyzeTrack } from './analysis/queue'

// Takes only a track id, not a path — the caller is the renderer (over
// IPC), which is untrusted. Looking the path up here, from the DB row this
// id actually owns, is what stops a compromised renderer from passing an
// arbitrary filesystem path and getting it read/analyzed/persisted as if
// it belonged to this track.
//
// cacheDir is passed in (not fetched internally via app.getPath) so this
// module has no hard Electron-app dependency — same reasoning as
// analysis/queue.ts's cacheDir parameter.
export async function downloadTrack(db: AppDatabase, id: number, cacheDir: string): Promise<void> {
  const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(id) as { path: string } | undefined
  if (!row) throw new Error(`No track with id ${id}`)
  const track = { id, path: row.path }

  await readFile(track.path) // forces Drive for Desktop to materialize the file locally
  db.prepare("UPDATE tracks SET cloud_status = 'local' WHERE id = ?").run(track.id)
  await analyzeTrack(db, track, cacheDir)
}
