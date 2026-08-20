import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import { openDatabase, type AppDatabase } from './db'
import { __setStoreForTests, getLastBackupAt } from './config'
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder } from './backup'

describe('shouldBackupToday', () => {
  it('returns true when never backed up', () => {
    expect(shouldBackupToday(null, new Date('2026-08-21T12:00:00Z'))).toBe(true)
  })

  it('returns false for a backup made earlier the same local day', () => {
    const now = new Date(2026, 7, 21, 18, 0, 0)
    const lastBackupAt = new Date(2026, 7, 21, 6, 0, 0).toISOString()
    expect(shouldBackupToday(lastBackupAt, now)).toBe(false)
  })

  it('returns true for a backup made on a different day', () => {
    const now = new Date(2026, 7, 21, 6, 0, 0)
    const lastBackupAt = new Date(2026, 7, 20, 23, 59, 0).toISOString()
    expect(shouldBackupToday(lastBackupAt, now)).toBe(true)
  })
})

describe('getBackupFolder', () => {
  it('appends a backups directory to the userData path', () => {
    expect(getBackupFolder('/Users/dj/Library/Application Support/App')).toBe(
      '/Users/dj/Library/Application Support/App/backups'
    )
  })
})

describe('runBackup / runBackupIfNeeded', () => {
  let dir: string
  let dbPath: string
  let configFilePath: string
  let backupFolder: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-test-'))
    dbPath = join(dir, 'collection.db')
    configFilePath = join(dir, 'config.json')
    backupFolder = join(dir, 'backups')
    writeFileSync(configFilePath, JSON.stringify({ collectionFolder: '/Users/dj/Music' }))
    db = openDatabase(dbPath)
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()
    __setStoreForTests(
      new Store({ name: `backup-test-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
        typeof Store
      >[0])
    )
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('runBackup writes a valid DB snapshot and a config copy, timestamped and never colliding', () => {
    const now = new Date('2026-08-21T12:00:00.000Z')
    const { dbBackupPath, configBackupPath } = runBackup(db, configFilePath, backupFolder, now)

    expect(existsSync(dbBackupPath)).toBe(true)
    expect(existsSync(configBackupPath)).toBe(true)

    const backupDb = openDatabase(dbBackupPath)
    const row = backupDb.prepare('SELECT filename FROM tracks').get() as { filename: string }
    expect(row.filename).toBe('a.wav')
    backupDb.close()

    const configCopy = JSON.parse(readFileSync(configBackupPath, 'utf-8'))
    expect(configCopy.collectionFolder).toBe('/Users/dj/Music')
  })

  it('runBackupIfNeeded backs up when none has run yet, and updates lastBackupAt', () => {
    const now = new Date('2026-08-21T12:00:00.000Z')
    runBackupIfNeeded(db, configFilePath, backupFolder, now)
    expect(getLastBackupAt()).toBe(now.toISOString())
    expect(existsSync(backupFolder)).toBe(true)
  })

  it('runBackupIfNeeded is a no-op on a second call the same day', () => {
    const first = new Date(2026, 7, 21, 6, 0, 0)
    const second = new Date(2026, 7, 21, 18, 0, 0)
    runBackupIfNeeded(db, configFilePath, backupFolder, first)
    const afterFirst = getLastBackupAt()
    runBackupIfNeeded(db, configFilePath, backupFolder, second)
    expect(getLastBackupAt()).toBe(afterFirst)
  })
})
