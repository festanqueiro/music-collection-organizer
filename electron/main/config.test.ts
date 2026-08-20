import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import { getCollectionFolder, setCollectionFolder, __setStoreForTests } from './config'

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
})
