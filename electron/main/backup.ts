import { mkdirSync, copyFileSync } from 'node:fs'
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

export function runBackupIfNeeded(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date
): void {
  if (!shouldBackupToday(getLastBackupAt(), now)) return
  runBackup(db, configFilePath, backupFolder, now)
  setLastBackupAt(now.toISOString())
}
