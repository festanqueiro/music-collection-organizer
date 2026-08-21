import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  setLastBackupAt,
  getConfigFilePath,
  __setStoreForTests,
} from './config'

describe('config store', () => {
  beforeEach(() => {
    __setStoreForTests(
      new Store({ name: `test-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
        typeof Store
      >[0])
    )
  })

  it('returns null when unset', () => {
    expect(getCollectionFolder()).toBeNull()
  })

  it('persists a set folder', () => {
    setCollectionFolder('/Users/dj/Music')
    expect(getCollectionFolder()).toBe('/Users/dj/Music')
  })

  it('returns null lastBackupAt when unset', () => {
    expect(getLastBackupAt()).toBeNull()
  })

  it('persists a set lastBackupAt', () => {
    setLastBackupAt('2026-08-21T12:00:00.000Z')
    expect(getLastBackupAt()).toBe('2026-08-21T12:00:00.000Z')
  })

  it('exposes the config file path', () => {
    expect(getConfigFilePath()).toMatch(/\.json$/)
  })
})
