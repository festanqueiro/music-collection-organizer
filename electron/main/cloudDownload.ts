import { createReadStream } from 'node:fs'
import type { AppDatabase } from './db'

// Takes only a track id, not a path — the caller is the renderer (over
// IPC), which is untrusted. Looking the path up here, from the DB row this
// id actually owns, is what stops a compromised renderer from passing an
// arbitrary filesystem path and getting it read as if it belonged to this
// track.
//
// Just brings the file down: reading it through forces Drive for Desktop
// (or any File Provider) to materialize it locally. Streamed and discarded,
// so a big AIFF isn't held in memory, and async, so the main process (and
// with it the whole app) stays responsive. Analysis is left to the caller,
// which runs it in the analysis worker — analysing here, in-process, froze
// the app for tens of seconds on a long track.
export async function downloadTrack(db: AppDatabase, id: number): Promise<void> {
  const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(id) as { path: string } | undefined
  if (!row) throw new Error(`No track with id ${id}`)
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(row.path)
    stream.on('data', () => {})
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  db.prepare("UPDATE tracks SET cloud_status = 'local' WHERE id = ?").run(id)
}
