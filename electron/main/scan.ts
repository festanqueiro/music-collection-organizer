import { statSync } from 'node:fs'
import { dirname, basename, extname } from 'node:path'
import { runInTransaction, type AppDatabase } from './db'
import { walkAudioFiles } from './folderWalk'
import { diffScan, type DbTrackRow } from './scanDiff'
import { isCloudOnly } from './cloudDetect'

export interface ScanResult {
  inserted: number
  updated: number
  missing: number
}

// Files no longer found on disk are never deleted — deleting a tracks row
// cascades and destroys every tag assignment on it, which would happen any
// time the collection folder is changed (or a drive isn't mounted yet), not
// just when a file is genuinely gone. Instead they're flagged present = 0
// and hidden from the renderer (see ipc.ts's tracks:getAll); if a file with
// the same path is found again in a later scan, it's revived (present = 1)
// with all of its tags intact, whether or not anything else about it changed.
export function runScan(db: AppDatabase, rootPath: string): ScanResult {
  const diskFiles = walkAudioFiles(rootPath)
  const dbRows = db.prepare('SELECT path, size, mtime FROM tracks').all() as DbTrackRow[]
  const presentByPath = new Map(
    (db.prepare('SELECT path, present FROM tracks').all() as { path: string; present: number }[]).map((r) => [
      r.path,
      r.present,
    ])
  )
  const diff = diffScan(diskFiles, dbRows)

  const insertStmt = db.prepare(`
    INSERT INTO tracks (path, filename, folder, format, size, mtime, cloud_status, analysis_status)
    VALUES (@path, @filename, @folder, @format, @size, @mtime, @cloud_status, 'pending')
  `)
  const updateStmt = db.prepare(`
    UPDATE tracks SET size = @size, mtime = @mtime, cloud_status = @cloud_status, analysis_status = 'pending', present = 1
    WHERE path = @path
  `)
  const markMissingStmt = db.prepare('UPDATE tracks SET present = 0 WHERE path = ?')
  const reviveStmt = db.prepare('UPDATE tracks SET present = 1 WHERE path = ?')

  const toRow = (file: { path: string; size: number; mtime: number }) => {
    const stats = statSync(file.path)
    const cloudStatus = isCloudOnly({ size: stats.size, blocks: (stats as any).blocks ?? 0 })
      ? 'cloud_only'
      : 'local'
    return {
      path: file.path,
      filename: basename(file.path),
      folder: dirname(file.path),
      format: extname(file.path).slice(1).toLowerCase(),
      size: file.size,
      mtime: file.mtime,
      cloud_status: cloudStatus,
    }
  }

  // Files that are unchanged (so diffScan skips them entirely) but were
  // previously flagged missing still need reviving.
  const updatedPaths = new Set(diff.toUpdate.map((f) => f.path))
  const toRevive = diskFiles.filter((f) => presentByPath.get(f.path) === 0 && !updatedPaths.has(f.path))

  runInTransaction(db, () => {
    for (const file of diff.toInsert) insertStmt.run(toRow(file))
    for (const file of diff.toUpdate) {
      // node:sqlite rejects a bound object with keys the SQL text doesn't
      // reference (unlike better-sqlite3, which silently ignores extras),
      // so this can't just pass toRow(file) — it has filename/folder/format
      // too, which this statement doesn't set.
      const row = toRow(file)
      updateStmt.run({ path: row.path, size: row.size, mtime: row.mtime, cloud_status: row.cloud_status })
    }
    for (const path of diff.toRemove) markMissingStmt.run(path)
    for (const file of toRevive) reviveStmt.run(file.path)
  })

  return { inserted: diff.toInsert.length, updated: diff.toUpdate.length, missing: diff.toRemove.length }
}
