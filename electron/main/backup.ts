import { mkdirSync, copyFileSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { AppDatabase } from './db'
import { setLastBackupAt } from './config'

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

// "2026-10-12T18-23-13-000Z" in a backup's name, back to a date.
export function newestBackupAt(backupFolder: string): string | null {
  const newest = listBackups(backupFolder)[0]?.timestamp
  const iso = newest?.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z')
  return iso && !Number.isNaN(new Date(iso).getTime()) ? iso : null
}

export function runBackupIfNeeded(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date,
  keep = 30
): void {
  // When *this computer* last backed up is its newest backup: the backups
  // are kept on each computer, but the config (and its lastBackupAt) is
  // shared when the data folder is in a synced folder — the second computer
  // to open it that day would never take one.
  if (!shouldBackupToday(newestBackupAt(backupFolder), now)) return
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

// Whether a backup is a database MCO can open: read through by SQLite
// itself, and with the tracks table in it. Throws with the reason if not —
// before anything of the live collection is touched.
export function checkBackup(entry: BackupEntry): void {
  let backup: DatabaseSync | null = null
  try {
    backup = new DatabaseSync(entry.dbPath, { readOnly: true })
    const check = backup.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined
    if (check?.integrity_check !== 'ok') throw new Error(String(check?.integrity_check ?? 'unreadable'))
    backup.prepare('SELECT count(*) FROM tracks').get()
  } catch (err) {
    throw new Error(`That backup can't be used — it is damaged (${err instanceof Error ? err.message : String(err)}). Nothing was changed.`)
  } finally {
    backup?.close()
  }
}

// The collection as it is right before a restore, kept next to the backups
// (as before-restore-<time>.db/.json: not listed as a backup, the last
// three kept) — the way back if the restore was a mistake.
const BEFORE_RESTORE_KEPT = 3
export function keepCurrentBeforeRestore(db: AppDatabase, configFilePath: string, backupFolder: string, now: Date): string {
  mkdirSync(backupFolder, { recursive: true })
  const stamp = timestampForFilename(now)
  const dbCopy = join(backupFolder, `before-restore-${stamp}.db`)
  db.exec(`VACUUM INTO '${dbCopy.replace(/'/g, "''")}'`)
  try {
    copyFileSync(configFilePath, join(backupFolder, `before-restore-${stamp}.json`))
  } catch {
    // No settings file yet: the database is what matters.
  }
  const kept = readdirSync(backupFolder)
    .filter((f) => /^before-restore-.+\.db$/.test(f))
    .sort()
    .reverse()
  for (const old of kept.slice(BEFORE_RESTORE_KEPT)) {
    rmSync(join(backupFolder, old), { force: true })
    rmSync(join(backupFolder, old.replace(/\.db$/, '.json')), { force: true })
  }
  return dbCopy
}

// Puts a backup in place of the live files. Each is copied next to its
// target first and then renamed over it, so a copy that fails half way
// (disk full, a drive pulled) leaves the live file whole.
export function restoreBackup(entry: BackupEntry, dbFilePath: string, configFilePath: string): void {
  const copies: [string, string][] = [
    [entry.dbPath, dbFilePath],
    [entry.configPath, configFilePath],
  ]
  try {
    for (const [from, to] of copies) copyFileSync(from, `${to}.restoring`)
  } catch (err) {
    for (const [, to] of copies) rmSync(`${to}.restoring`, { force: true })
    throw err
  }
  for (const [, to] of copies) renameSync(`${to}.restoring`, to)
}
