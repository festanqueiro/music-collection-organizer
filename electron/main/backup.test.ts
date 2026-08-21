import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import { openDatabase, type AppDatabase } from './db'
import { __setStoreForTests, getLastBackupAt } from './config'
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder, pruneOldBackups, listBackups, restoreBackup } from './backup'

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

  it('runBackup throws and leaves no orphan .db snapshot when the config file does not exist yet', () => {
    const missingConfigFilePath = join(dir, 'config-never-written.json')
    const now = new Date('2026-08-21T12:00:00.000Z')

    expect(() => runBackup(db, missingConfigFilePath, backupFolder, now)).toThrow()

    if (existsSync(backupFolder)) {
      const dbFiles = readdirSync(backupFolder).filter((f) => f.endsWith('.db'))
      expect(dbFiles).toEqual([])
    }
  })
})

describe('pruneOldBackups', () => {
  let dir: string
  let backupFolder: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prune-test-'))
    backupFolder = join(dir, 'backups')
    mkdirSync(backupFolder, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeBackupPair(timestamp: string) {
    writeFileSync(join(backupFolder, `collection-${timestamp}.db`), 'x')
    writeFileSync(join(backupFolder, `config-${timestamp}.json`), '{}')
  }

  it('deletes both files of the oldest pairs beyond the keep count', () => {
    const timestamps = ['2026-08-18T00-00-00-000Z', '2026-08-19T00-00-00-000Z', '2026-08-20T00-00-00-000Z']
    for (const ts of timestamps) writeBackupPair(ts)

    pruneOldBackups(backupFolder, 2)

    const remaining = readdirSync(backupFolder).sort()
    expect(remaining).toEqual([
      'collection-2026-08-19T00-00-00-000Z.db',
      'collection-2026-08-20T00-00-00-000Z.db',
      'config-2026-08-19T00-00-00-000Z.json',
      'config-2026-08-20T00-00-00-000Z.json',
    ])
  })

  it('is a no-op when the count is within the keep limit', () => {
    writeBackupPair('2026-08-20T00-00-00-000Z')
    pruneOldBackups(backupFolder, 30)
    expect(readdirSync(backupFolder)).toHaveLength(2)
  })

  it('does not throw when the backup folder does not exist', () => {
    rmSync(backupFolder, { recursive: true, force: true })
    expect(() => pruneOldBackups(backupFolder, 30)).not.toThrow()
  })
})

describe('listBackups / restoreBackup', () => {
  let dir: string
  let backupFolder: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'restore-test-'))
    backupFolder = join(dir, 'backups')
    mkdirSync(backupFolder, { recursive: true })
    writeFileSync(join(backupFolder, 'collection-2026-08-19T00-00-00-000Z.db'), 'old-db')
    writeFileSync(join(backupFolder, 'config-2026-08-19T00-00-00-000Z.json'), '{"old":true}')
    writeFileSync(join(backupFolder, 'collection-2026-08-20T00-00-00-000Z.db'), 'new-db')
    writeFileSync(join(backupFolder, 'config-2026-08-20T00-00-00-000Z.json'), '{"new":true}')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists backups newest first', () => {
    const entries = listBackups(backupFolder)
    expect(entries.map((e) => e.timestamp)).toEqual([
      '2026-08-20T00-00-00-000Z',
      '2026-08-19T00-00-00-000Z',
    ])
    expect(entries[0].dbPath).toBe(join(backupFolder, 'collection-2026-08-20T00-00-00-000Z.db'))
    expect(entries[0].configPath).toBe(join(backupFolder, 'config-2026-08-20T00-00-00-000Z.json'))
  })

  it('returns an empty list when the backup folder does not exist', () => {
    rmSync(backupFolder, { recursive: true, force: true })
    expect(listBackups(backupFolder)).toEqual([])
  })

  it('restoreBackup copies the chosen snapshot over the live file paths', () => {
    const entries = listBackups(backupFolder)
    const oldEntry = entries.find((e) => e.timestamp === '2026-08-19T00-00-00-000Z')!

    const liveDbPath = join(dir, 'collection.db')
    const liveConfigPath = join(dir, 'config.json')
    writeFileSync(liveDbPath, 'current-db')
    writeFileSync(liveConfigPath, '{"current":true}')

    restoreBackup(oldEntry, liveDbPath, liveConfigPath)

    expect(readFileSync(liveDbPath, 'utf-8')).toBe('old-db')
    expect(readFileSync(liveConfigPath, 'utf-8')).toBe('{"old":true}')
  })
})
