// Reads each file's own tags (title, artist, album, genre, year) into the
// DB. Analysis reads them too, but most of a collection may never be
// analysed — without this, those tracks show no artist even when the file
// has one, and a "no artist tag" filter would be meaningless. Only the
// tags are parsed (no cover art, no audio), so it's quick per file; it runs
// in the background after a scan, over the tracks whose tags_read_at is
// still NULL (new, or changed since last read).
import { parseFile } from 'music-metadata'
import { existsSync } from 'node:fs'
import { readBitDepth } from './analysis/metadata'
import type { AppDatabase } from './db'

export interface FileTags {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  // Read with the tags, from the same header (see readBitDepth).
  bitDepth: number | null
}

export async function readFileTags(path: string): Promise<FileTags> {
  const { common, format } = await parseFile(path, { skipCovers: true, duration: false })
  return {
    title: common.title ?? null,
    artist: common.artist ?? null,
    album: common.album ?? null,
    genre: common.genre?.[0] ?? null,
    year: common.year ?? null,
    bitDepth: await readBitDepth(path, format),
  }
}

// tracks.bit_depth for a file that was looked at and has none (a lossy
// file, or one that couldn't be read). NULL means not looked at yet: the
// reader below takes those too, which is how the tracks of a collection
// from before the column get theirs.
export const NO_BIT_DEPTH = 0

export function saveFileTags(db: AppDatabase, trackId: number, tags: FileTags): void {
  db.prepare(
    'UPDATE tracks SET title = ?, artist = ?, album = ?, genre_tag = ?, year = ?, bit_depth = ?, tags_read_at = ? WHERE id = ?'
  ).run(tags.title, tags.artist, tags.album, tags.genre, tags.year, tags.bitDepth ?? NO_BIT_DEPTH, Date.now(), trackId)
}

type PendingRow = { id: number; path: string; mtime: number; readAt: number | null }

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

  // The row is still the file that was parsed: same path, same file
  // (mtime), and nobody else has read or written its tags meanwhile.
  private unchangedSince(row: PendingRow): boolean {
    const now = this.db.prepare('SELECT path, mtime, tags_read_at AS readAt FROM tracks WHERE id = ?').get(row.id) as Omit<PendingRow, 'id'> | undefined
    return !!now && now.path === row.path && now.mtime === row.mtime && now.readAt === row.readAt
  }

  private async pass(): Promise<void> {
    const pending = this.db
      .prepare(
        "SELECT id, path, mtime, tags_read_at AS readAt FROM tracks WHERE (tags_read_at IS NULL OR bit_depth IS NULL) AND present = 1 AND cloud_status = 'local'"
      )
      .all() as PendingRow[]
    if (pending.length === 0) return
    let lastReport = Date.now()
    for (let i = 0; i < pending.length; i++) {
      const { id, path } = pending[i]
      try {
        const tags = await readFileTags(path)
        // While it was being parsed the file may have been saved, converted
        // or moved: what was read is then the old file's. Left for the
        // next pass, which reads it as it is now.
        if (!this.unchangedSince(pending[i])) this.again = true
        else saveFileTags(this.db, id, tags)
      } catch {
        // A file that isn't there (its drive unplugged, not synced yet) is
        // read when it is back. One that can't be parsed is marked read,
        // so it isn't tried again on every pass.
        if (existsSync(path)) {
          this.db.prepare('UPDATE tracks SET tags_read_at = ?, bit_depth = COALESCE(bit_depth, ?) WHERE id = ?').run(Date.now(), NO_BIT_DEPTH, id)
        }
      }
      if (Date.now() - lastReport > 2000) {
        lastReport = Date.now()
        this.onProgress({ remaining: pending.length - i - 1, done: false })
      }
    }
    this.onProgress({ remaining: 0, done: true })
  }
}
