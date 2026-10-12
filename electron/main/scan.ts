import { dirname, basename, extname, sep } from 'node:path'
import { runInTransaction, type AppDatabase } from './db'
import { walkAudioFiles, type DiskFileWithBlocks } from './folderWalk'
import { diffScan, type DbTrackRow } from './scanDiff'
import { isCloudOnly } from './cloudDetect'

export interface ScanResult {
  inserted: number
  updated: number
  missing: number
  // Missing tracks deleted by a removeMissing scan (0 otherwise).
  removed: number
  // Tracks found again at another place (the collection moved): the same
  // row, with everything on it, now at the new path.
  moved: number
}

// How two paths are compared when looking for a moved track: the accents
// stored the same way, and either separator (a collection that came from
// the other platform).
const comparable = (path: string) => path.normalize('NFC').replace(/\\/g, '/')

// Files no longer found on disk are never deleted — deleting a tracks row
// cascades and destroys every tag assignment on it, which would happen any
// time the collection folder is changed (or a drive isn't mounted yet), not
// just when a file is genuinely gone. Instead they're flagged present = 0
// and hidden from the renderer (see ipc.ts's tracks:getAll); if a file with
// the same path is found again in a later scan, it's revived (present = 1)
// with all of its tags intact, whether or not anything else about it changed.
//
// removeMissing (the toolbar's Update Collection only — ADR 0040) does
// delete them, and their tags: every missing track under rootPath, whether
// it went missing now or earlier. Tracks from a previous collection folder
// are left alone, and nothing is removed if the scan found no files at all
// (the folder is unmounted or not synced yet), since then everything would
// look missing — nor the tracks of a folder inside it that couldn't be read.
//
// A collection that moved (another computer, another drive, a renamed
// folder) is the same collection: a file not yet known, at the same place
// inside rootPath and of the same size as exactly one track whose file isn't
// there, is that track. Its row takes the new path and keeps its analysis,
// cues, tags and playlists — nothing is analysed again.
export function runScan(db: AppDatabase, rootPath: string, opts: { removeMissing?: boolean } = {}): ScanResult {
  const unreadable: string[] = []
  const diskFiles = walkAudioFiles(rootPath, unreadable)
  const trackRows = db.prepare('SELECT path, size, mtime, present, cloud_status FROM tracks').all() as unknown as (DbTrackRow & {
    present: number
    cloud_status: string
  })[]
  const presentByPath = new Map(trackRows.map((r) => [r.path, r.present]))
  const cloudStatusByPath = new Map(trackRows.map((r) => [r.path, r.cloud_status]))
  const diff = diffScan(diskFiles, trackRows)

  const insertStmt = db.prepare(`
    INSERT INTO tracks (path, filename, folder, format, size, mtime, birthtime, cloud_status, analysis_status)
    VALUES (@path, @filename, @folder, @format, @size, @mtime, @birthtime, @cloud_status, 'pending')
  `)
  const updateStmt = db.prepare(`
    UPDATE tracks SET size = @size, mtime = @mtime, birthtime = @birthtime, cloud_status = @cloud_status, analysis_status = 'pending', tags_read_at = NULL, present = 1
    WHERE path = @path
  `)
  const markMissingStmt = db.prepare('UPDATE tracks SET present = 0 WHERE path = ?')
  const setCloudStatusStmt = db.prepare('UPDATE tracks SET cloud_status = ? WHERE path = ?')
  const reviveStmt = db.prepare('UPDATE tracks SET present = 1 WHERE path = ?')
  const deleteStmt = db.prepare('DELETE FROM tracks WHERE path = ? AND present = 0')

  const toRow = (file: DiskFileWithBlocks) => {
    // blocks was already captured by walkAudioFiles's own statSync — no
    // need to stat every file a second time here just for this.
    const cloudStatus = isCloudOnly({ size: file.size, blocks: file.blocks }) ? 'cloud_only' : 'local'
    return {
      path: file.path,
      filename: basename(file.path),
      folder: dirname(file.path),
      format: extname(file.path).slice(1).toLowerCase(),
      size: file.size,
      mtime: file.mtime,
      birthtime: file.birthtime,
      cloud_status: cloudStatus,
    }
  }

  // Files that are unchanged (so diffScan skips them entirely) but were
  // previously flagged missing still need reviving.
  const updatedPaths = new Set(diff.toUpdate.map((f) => f.path))
  const toRevive = diskFiles.filter((f) => presentByPath.get(f.path) === 0 && !updatedPaths.has(f.path))
  // Unchanged files whose download state changed since the last scan — a
  // Drive file downloaded (or freed up) keeps its size and mtime, so
  // diffScan doesn't see it, and it would stay flagged cloud-only forever.
  const toRecheck = diskFiles
    .filter((f) => cloudStatusByPath.has(f.path) && !updatedPaths.has(f.path))
    .map((f) => ({ path: f.path, status: toRow(f).cloud_status }))
    .filter((f) => f.status !== cloudStatusByPath.get(f.path))

  const onDisk = new Set(diskFiles.map((f) => f.path))
  const underRoot = rootPath.endsWith(sep) ? rootPath : rootPath + sep

  const nameOf = (path: string) => comparable(path).split('/').pop() ?? ''
  const goneBySizeAndName = new Map<string, string[]>()
  for (const row of trackRows) {
    if (onDisk.has(row.path)) continue
    const key = `${row.size}:${nameOf(row.path)}`
    goneBySizeAndName.set(key, [...(goneBySizeAndName.get(key) ?? []), row.path])
  }
  const moved: { from: string; file: DiskFileWithBlocks }[] = []
  const movedFrom = new Set<string>()
  for (const file of diff.toInsert) {
    if (!file.path.startsWith(underRoot)) continue
    const inside = comparable(file.path.slice(underRoot.length))
    const found = (goneBySizeAndName.get(`${file.size}:${nameOf(file.path)}`) ?? []).filter(
      (path) => !movedFrom.has(path) && comparable(path).endsWith(`/${inside}`)
    )
    // Two tracks it could be: no guess, it comes in as a new file.
    if (found.length !== 1) continue
    movedFrom.add(found[0])
    moved.push({ from: found[0], file })
  }
  const movedTo = new Set(moved.map((m) => m.file.path))
  const toInsert = diff.toInsert.filter((f) => !movedTo.has(f.path))
  const toRemove = diff.toRemove.filter((path) => !movedFrom.has(path))
  // The date added (birthtime) stays the old one: a copy is a new file to
  // the disk, not to the collection.
  const moveStmt = db.prepare(`
    UPDATE tracks SET path = @path, filename = @filename, folder = @folder, mtime = @mtime, cloud_status = @cloud_status, present = 1
    WHERE path = @from
  `)
  // What is in a folder that couldn't be read (permissions, a mount that
  // dropped, a cloud folder not answering) isn't known to be gone: its
  // tracks, and their tags, are never removed on that scan.
  const unknown = (path: string) => unreadable.some((failed) => path === failed || path.startsWith(failed.endsWith(sep) ? failed : failed + sep))
  const toDelete =
    opts.removeMissing && diskFiles.length > 0
      ? trackRows.map((r) => r.path).filter((path) => path.startsWith(underRoot) && !onDisk.has(path) && !unknown(path) && !movedFrom.has(path))
      : []

  runInTransaction(db, () => {
    for (const { from, file } of moved) {
      const row = toRow(file)
      moveStmt.run({ from, path: row.path, filename: row.filename, folder: row.folder, mtime: row.mtime, cloud_status: row.cloud_status })
    }
    for (const file of toInsert) insertStmt.run(toRow(file))
    for (const file of diff.toUpdate) {
      // node:sqlite rejects a bound object with keys the SQL text doesn't
      // reference (unlike better-sqlite3, which silently ignores extras),
      // so this can't just pass toRow(file) — it has filename/folder/format
      // too, which this statement doesn't set.
      const row = toRow(file)
      updateStmt.run({
        path: row.path,
        size: row.size,
        mtime: row.mtime,
        birthtime: row.birthtime,
        cloud_status: row.cloud_status,
      })
    }
    for (const path of toRemove) markMissingStmt.run(path)
    for (const file of toRevive) reviveStmt.run(file.path)
    for (const file of toRecheck) setCloudStatusStmt.run(file.status, file.path)
    for (const path of toDelete) deleteStmt.run(path)
  })

  // Only files that went missing in this scan — ones already flagged
  // stay missing silently, or every watcher rescan would report them again.
  const deleted = new Set(toDelete)
  const newlyMissing = toRemove.filter((path) => presentByPath.get(path) === 1 && !deleted.has(path)).length
  return {
    inserted: toInsert.length,
    updated: diff.toUpdate.length,
    missing: newlyMissing,
    removed: toDelete.length,
    moved: moved.length,
  }
}
