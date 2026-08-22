import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDataFolder } from './dataMigration'

describe('migrateDataFolder', () => {
  let root: string
  let oldDbPath: string
  let oldConfigPath: string
  let newDataFolder: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'migrate-test-'))
    oldDbPath = join(root, 'old', 'collection.db')
    oldConfigPath = join(root, 'old', 'config.json')
    mkdirSync(join(root, 'old'), { recursive: true })
    writeFileSync(oldDbPath, 'old-db-contents')
    writeFileSync(oldConfigPath, '{"collectionFolder":"/old/path"}')
    newDataFolder = join(root, 'new', '.mco')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('copies the db and config into a fresh newDataFolder, leaving the old files in place', () => {
    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath })

    expect(readFileSync(join(newDataFolder, 'collection.db'), 'utf-8')).toBe('old-db-contents')
    expect(readFileSync(join(newDataFolder, 'config.json'), 'utf-8')).toBe('{"collectionFolder":"/old/path"}')
    // Never deletes the source — the safety net this whole feature exists for.
    expect(existsSync(oldDbPath)).toBe(true)
    expect(existsSync(oldConfigPath)).toBe(true)
  })

  it('creates newDataFolder (including intermediate dirs) if it does not exist yet', () => {
    expect(existsSync(newDataFolder)).toBe(false)
    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath })
    expect(existsSync(newDataFolder)).toBe(true)
  })

  it('stamps collectionFolderToStamp into the migrated config.json when given', () => {
    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath, collectionFolderToStamp: '/new/path' })
    const written = JSON.parse(readFileSync(join(newDataFolder, 'config.json'), 'utf-8'))
    expect(written.collectionFolder).toBe('/new/path')
  })

  it('does not touch config.json at all when collectionFolderToStamp is omitted', () => {
    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath })
    const written = JSON.parse(readFileSync(join(newDataFolder, 'config.json'), 'utf-8'))
    expect(written.collectionFolder).toBe('/old/path')
  })

  it('adopts an existing collection.db at newDataFolder instead of overwriting it', () => {
    mkdirSync(newDataFolder, { recursive: true })
    writeFileSync(join(newDataFolder, 'collection.db'), 'already-here-db')
    writeFileSync(join(newDataFolder, 'config.json'), '{"collectionFolder":"/already/here"}')

    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath, collectionFolderToStamp: '/new/path' })

    // The pre-existing DB wins — never clobbered by the "old" source.
    expect(readFileSync(join(newDataFolder, 'collection.db'), 'utf-8')).toBe('already-here-db')
  })

  it('still re-stamps collectionFolder even when adopting an already-populated newDataFolder', () => {
    mkdirSync(newDataFolder, { recursive: true })
    writeFileSync(join(newDataFolder, 'collection.db'), 'already-here-db')
    writeFileSync(join(newDataFolder, 'config.json'), '{"collectionFolder":"/already/here"}')

    migrateDataFolder({ newDataFolder, oldDbPath, oldConfigPath, collectionFolderToStamp: '/new/path' })

    const written = JSON.parse(readFileSync(join(newDataFolder, 'config.json'), 'utf-8'))
    expect(written.collectionFolder).toBe('/new/path')
  })

  it('is a no-op copy (but still stamps) when the old db/config paths do not exist (fresh install)', () => {
    const missingDbPath = join(root, 'never-existed.db')
    const missingConfigPath = join(root, 'never-existed.json')

    expect(() =>
      migrateDataFolder({
        newDataFolder,
        oldDbPath: missingDbPath,
        oldConfigPath: missingConfigPath,
        collectionFolderToStamp: '/brand/new',
      })
    ).not.toThrow()

    expect(existsSync(join(newDataFolder, 'collection.db'))).toBe(false)
    const written = JSON.parse(readFileSync(join(newDataFolder, 'config.json'), 'utf-8'))
    expect(written.collectionFolder).toBe('/brand/new')
  })
})
