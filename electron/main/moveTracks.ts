// Moving tracks' files into another folder of the collection (dragging
// rows onto a folder in the Folders view). The database row moves with the
// file — same id, so tags, play counts and queue positions stay — and it's
// updated before the file is renamed, so the folder watcher's rescan finds
// the new path already known and the old one simply gone.
import { copyFile, rename, unlink } from 'node:fs/promises'
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
  const taken = new Set<string>()
  for (const track of tracks) {
    if (dirname(track.path) === destination) {
      plan.alreadyThere.push(track.id)
      continue
    }
    const to = join(destination, basename(track.path))
    // Two dragged files with the same name can't both land there either.
    if (exists(to) || taken.has(to)) {
      plan.conflicts.push({ id: track.id, path: track.path })
      continue
    }
    taken.add(to)
    plan.moves.push({ id: track.id, from: track.path, to })
  }
  return plan
}

// Renames, or copies then deletes across volumes (an external drive, a
// different cloud).
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to)
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
    update.run(to, folder, id)
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

