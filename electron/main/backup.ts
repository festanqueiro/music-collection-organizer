import { mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { AppDatabase } from './db'
import { getLastBackupAt, setLastBackupAt } from './config'

export function getBackupFolder(userDataPath: string): string {
  return join(userDataPath, 'backups')
}

export function shouldBackupToday(lastBackupAt: string | null, now: Date): boolean {
  if (!lastBackupAt) return true
  const last = new Date(lastBackupAt)
  return (
    last.getFullYear() !== now.getFullYear() ||
    last.getMonth() !== now.getMonth() ||
    last.getDate() !== now.getDate()
  )
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

export function runBackup(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date
): { dbBackupPath: string; configBackupPath: string } {
  mkdirSync(backupFolder, { recursive: true })

  const stamp = timestampForFilename(now)
  const dbBackupPath = join(backupFolder, `collection-${stamp}.db`)
  const configBackupPath = join(backupFolder, `config-${stamp}.json`)

  // Copy the config file first: electron-store creates its backing JSON file
  // lazily (on first .set() call), so on a fresh install it may not exist yet.
  // Doing this before the VACUUM INTO ensures a missing config file throws
  // before any DB snapshot is written, avoiding an orphan .db backup.
  copyFileSync(configFilePath, configBackupPath)

  // VACUUM INTO takes a plain SQL string, not a bindable parameter — the
  // destination is always a path we constructed above (timestamp + fixed
  // folder), never user input, but single quotes are still escaped
  // defensively since SQL string literals use them as delimiters.
  const escapedPath = dbBackupPath.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escapedPath}'`)

  return { dbBackupPath, configBackupPath }
}

export function pruneOldBackups(backupFolder: string, keep: number): void {
  let files: string[]
  try {
    files = readdirSync(backupFolder)
  } catch {
    return // backup folder doesn't exist yet — nothing to prune
  }

  const timestamps = new Set<string>()
  for (const file of files) {
    const match = file.match(/^collection-(.+)\.db$/)
    if (match) timestamps.add(match[1])
  }

  // ISO-derived timestamps (with : and . replaced by -) sort chronologically
  // as plain strings, so lexicographic sort is correct here.
  const sorted = [...timestamps].sort()
  const toDelete = sorted.slice(0, Math.max(0, sorted.length - keep))

  for (const timestamp of toDelete) {
    for (const [prefix, ext] of [
      ['collection', 'db'],
      ['config', 'json'],
    ] as const) {
      try {
        unlinkSync(join(backupFolder, `${prefix}-${timestamp}.${ext}`))
      } catch {
        // best effort — already gone is fine
      }
    }
  }
}

export function runBackupIfNeeded(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date,
  keep = 30
): void {
  if (!shouldBackupToday(getLastBackupAt(), now)) return
  runBackup(db, configFilePath, backupFolder, now)
  setLastBackupAt(now.toISOString())
  try {
    pruneOldBackups(backupFolder, keep)
  } catch (err) {
    // A pruning failure must never mark an otherwise-successful backup as
    // failed (index.ts's performBackupCheck would set lastBackupError from
    // any exception this function throws).
    console.error('pruneOldBackups failed', err)
  }
}

export interface BackupEntry {
  timestamp: string
  dbPath: string
  configPath: string
}

export function listBackups(backupFolder: string): BackupEntry[] {
  let files: string[]
  try {
    files = readdirSync(backupFolder)
  } catch {
    return []
  }

  const timestamps = new Set<string>()
  for (const file of files) {
    const match = file.match(/^collection-(.+)\.db$/)
    if (match) timestamps.add(match[1])
  }

  return [...timestamps]
    .sort()
    .reverse()
    .map((timestamp) => ({
      timestamp,
      dbPath: join(backupFolder, `collection-${timestamp}.db`),
      configPath: join(backupFolder, `config-${timestamp}.json`),
    }))
}

export function restoreBackup(entry: BackupEntry, dbFilePath: string, configFilePath: string): void {
  copyFileSync(entry.dbPath, dbFilePath)
  copyFileSync(entry.configPath, configFilePath)
}
