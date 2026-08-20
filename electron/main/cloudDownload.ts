import { readFile } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { analyzeTrack } from './analysis/queue'

export async function downloadTrack(db: Database.Database, track: { id: number; path: string }): Promise<void> {
  await readFile(track.path) // forces Drive for Desktop to materialize the file locally
  db.prepare("UPDATE tracks SET cloud_status = 'local' WHERE id = ?").run(track.id)
  await analyzeTrack(db, track)
}
