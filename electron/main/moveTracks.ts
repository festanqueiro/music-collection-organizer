// Moving tracks' files into another folder of the collection (dragging
// rows onto a folder in the Folders view). The database row moves with the
// file — same id, so tags, play counts and queue positions stay — and it's
// updated before the file is renamed, so the folder watcher's rescan finds
// the new path already known and the old one simply gone.
import { constants } from 'node:fs'
import { access, copyFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export interface TrackLocation {
  id: number
  path: string
}

export interface MovePlan {
  // Files to move, and where to.
  moves: { id: number; from: string; to: string }[]
  // Already in the destination folder: nothing to do.
  alreadyThere: number[]
  // A file of the same name is already in the destination: left alone.
  conflicts: { id: number; path: string }[]
}

export function planMove(tracks: TrackLocation[], destination: string, exists: (path: string) => boolean): MovePlan {
  const plan: MovePlan = { moves: [], alreadyThere: [], conflicts: [] }
  // Names are compared as the disk compares them on macOS and Windows:
  // "Song.wav" and "song.wav" (or the same name with its accents written
  // the other way) are one file there, and the second would overwrite the first.
  const sameName = (path: string) => path.normalize('NFC').toLowerCase()
  const taken = new Set<string>()
  for (const track of tracks) {
    if (dirname(track.path) === destination) {
      plan.alreadyThere.push(track.id)
      continue
    }
    const to = join(destination, basename(track.path))
    // Two dragged files with the same name can't both land there either.
    if (exists(to) || taken.has(sameName(to))) {
      plan.conflicts.push({ id: track.id, path: track.path })
      continue
    }
    taken.add(sameName(to))
    plan.moves.push({ id: track.id, from: track.path, to })
  }
  return plan
}

// Renames, or copies then deletes across volumes (an external drive, a
// different cloud).
// Never onto a file that is there: `rename` replaces it without a word, and
// not through the Trash. The plan has checked already; this is for a file
// that appeared since, or a name the plan took for free.
async function moveFile(from: string, to: string): Promise<void> {
  const there = await access(to).then(
    () => true,
    () => false
  )
  if (there) throw new Error('A file of that name is already there')
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to, constants.COPYFILE_EXCL)
    await unlink(from)
  }
}

export interface MovedTrack {
  id: number
  path: string
  folder: string
}

// Carries out a plan's moves one by one; a file that fails to move keeps
// its old path in the database. Returns the tracks that moved, with their
// new path and folder, and the ones that failed.
export async function applyMoves(
  db: DatabaseSync,
  plan: MovePlan
): Promise<{ moved: MovedTrack[]; failed: { id: number; path: string; error: string }[] }> {
  const update = db.prepare('UPDATE tracks SET path = ?, folder = ? WHERE id = ?')
  const moved: MovedTrack[] = []
  const failed: { id: number; path: string; error: string }[] = []
  for (const { id, from, to } of plan.moves) {
    const folder = dirname(to)
    try {
      update.run(to, folder, id)
    } catch (err) {
      // The path is another row's: a track recorded there whose file is
      // gone (kept, hidden, until Update Collection). This file stays where
      // it is, and the rest of the batch goes on.
      const taken = /UNIQUE/i.test(String(err))
      failed.push({ id, path: from, error: taken ? 'A missing track is recorded at that place — run Update Collection first' : err instanceof Error ? err.message : String(err) })
      continue
    }
    try {
      await moveFile(from, to)
      moved.push({ id, path: to, folder })
    } catch (err) {
      update.run(from, dirname(from), id)
      failed.push({ id, path: from, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { moved, failed }
}

