import { statSync } from 'node:fs'
import { dirname, basename, extname } from 'node:path'
import type Database from 'better-sqlite3'
import { walkAudioFiles } from './folderWalk'
import { diffScan, type DbTrackRow } from './scanDiff'
import { isCloudOnly } from './cloudDetect'

export interface ScanResult {
  inserted: number
  updated: number
  removed: number
}

export function runScan(db: Database.Database, rootPath: string): ScanResult {
  const diskFiles = walkAudioFiles(rootPath)
  const dbRows = db.prepare('SELECT path, size, mtime FROM tracks').all() as DbTrackRow[]
  const diff = diffScan(diskFiles, dbRows)

  const insertStmt = db.prepare(`
    INSERT INTO tracks (path, filename, folder, format, size, mtime, cloud_status, analysis_status)
    VALUES (@path, @filename, @folder, @format, @size, @mtime, @cloud_status, 'pending')
  `)
  const updateStmt = db.prepare(`
    UPDATE tracks SET size = @size, mtime = @mtime, cloud_status = @cloud_status, analysis_status = 'pending'
    WHERE path = @path
  `)
  const removeStmt = db.prepare('DELETE FROM tracks WHERE path = ?')

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

  const transaction = db.transaction(() => {
    for (const file of diff.toInsert) insertStmt.run(toRow(file))
    for (const file of diff.toUpdate) updateStmt.run(toRow(file))
    for (const path of diff.toRemove) removeStmt.run(path)
  })
  transaction()

  return { inserted: diff.toInsert.length, updated: diff.toUpdate.length, removed: diff.toRemove.length }
}
