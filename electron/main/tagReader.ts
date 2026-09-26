// Reads each file's own tags (title, artist, album, genre, year) into the
// DB. Analysis reads them too, but most of a collection may never be
// analysed — without this, those tracks show no artist even when the file
// has one, and a "no artist tag" filter would be meaningless. Only the
// tags are parsed (no cover art, no audio), so it's quick per file; it runs
// in the background after a scan, over the tracks whose tags_read_at is
// still NULL (new, or changed since last read).
import { parseFile } from 'music-metadata'
import type { AppDatabase } from './db'

export interface FileTags {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
}

export async function readFileTags(path: string): Promise<FileTags> {
  const { common } = await parseFile(path, { skipCovers: true, duration: false })
  return {
    title: common.title ?? null,
    artist: common.artist ?? null,
    album: common.album ?? null,
    genre: common.genre?.[0] ?? null,
    year: common.year ?? null,
  }
}

export function saveFileTags(db: AppDatabase, trackId: number, tags: FileTags): void {
  db.prepare(
    'UPDATE tracks SET title = ?, artist = ?, album = ?, genre_tag = ?, year = ?, tags_read_at = ? WHERE id = ?'
  ).run(tags.title, tags.artist, tags.album, tags.genre, tags.year, Date.now(), trackId)
}

// Tells the renderer how many tracks are left, and when tags changed.
export type TagReadProgress = { remaining: number; done: boolean }

export class TagReader {
  private running = false
  private again = false

  constructor(
    private readonly db: AppDatabase,
    private readonly onProgress: (progress: TagReadProgress) => void
  ) {}

  // Starts a pass (or queues one more if a pass is already running, so
  // tracks found by a scan mid-pass still get read).
  run(): void {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    this.pass()
      .catch((err) => console.error('reading tags failed', err))
      .finally(() => {
        this.running = false
        if (this.again) {
          this.again = false
          this.run()
        }
      })
  }

  private async pass(): Promise<void> {
    const pending = this.db
      .prepare(
        "SELECT id, path FROM tracks WHERE tags_read_at IS NULL AND present = 1 AND cloud_status = 'local'"
      )
      .all() as { id: number; path: string }[]
    if (pending.length === 0) return
    let lastReport = Date.now()
    for (let i = 0; i < pending.length; i++) {
      const { id, path } = pending[i]
      try {
        saveFileTags(this.db, id, await readFileTags(path))
      } catch {
        // Unreadable tags: mark it read anyway, so it isn't retried forever.
        this.db.prepare('UPDATE tracks SET tags_read_at = ? WHERE id = ?').run(Date.now(), id)
      }
      if (Date.now() - lastReport > 2000) {
        lastReport = Date.now()
        this.onProgress({ remaining: pending.length - i - 1, done: false })
      }
    }
    this.onProgress({ remaining: 0, done: true })
  }
}
