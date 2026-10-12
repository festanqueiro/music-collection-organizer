// A note in the data folder saying which computer has the collection open.
// With the data folder in a synced folder (Drive, Dropbox, iCloud), two
// computers can open the same collection.db at once: each writes its own
// copy and the sync keeps whichever uploads last — the other's tags and
// playlists from that session are gone, without a word. SQLite's own lock
// can't see the other computer. This can't either, for certain (the note
// travels with the sync, minutes late or not at all offline): it warns when
// it can, at launch, and never stops anyone.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OpenMarker {
  host: string
  // When that computer last said it was still open (it says so every minute).
  at: number
}

const MARKER = 'open-on.json'
// Older than this, the note is of a session that ended without clearing it
// (a crash, a lid closed for the night).
export const MARKER_FRESH_MS = 3 * 60 * 1000

export function readOpenMarker(dataFolder: string): OpenMarker | null {
  try {
    const marker = JSON.parse(readFileSync(join(dataFolder, MARKER), 'utf8')) as Partial<OpenMarker>
    return typeof marker.host === 'string' && typeof marker.at === 'number' ? { host: marker.host, at: marker.at } : null
  } catch {
    return null
  }
}

// Open on another computer, as far as the note says: another host's, and recent.
export function isOpenElsewhere(marker: OpenMarker | null, host: string, now: number): boolean {
  return !!marker && marker.host !== host && now - marker.at >= 0 && now - marker.at < MARKER_FRESH_MS
}

export function writeOpenMarker(dataFolder: string, host: string, now: number): void {
  try {
    writeFileSync(join(dataFolder, MARKER), JSON.stringify({ host, at: now } satisfies OpenMarker))
  } catch {
    // A data folder that can't be written to has bigger problems, reported elsewhere.
  }
}

// On quit: only this computer's own note.
export function clearOpenMarker(dataFolder: string, host: string): void {
  if (readOpenMarker(dataFolder)?.host === host) rmSync(join(dataFolder, MARKER), { force: true })
}
