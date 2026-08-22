import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import { getDataFolder, setDataFolder, __setBootstrapStoreForTests } from './bootstrap'

describe('bootstrap store', () => {
  beforeEach(() => {
    __setBootstrapStoreForTests(
      new Store({ name: `test-bootstrap-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
        typeof Store
      >[0])
    )
  })

  it('returns null when unset (fresh install, still on the default userData location)', () => {
    expect(getDataFolder()).toBeNull()
  })

  it('persists a set data folder', () => {
    setDataFolder('/Users/dj/Music/.mco')
    expect(getDataFolder()).toBe('/Users/dj/Music/.mco')
  })
})
