import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import { setDataFolder, __setBootstrapStoreForTests } from './bootstrap'
import { getConfigFilePath, setCollectionFolder, getCollectionFolder } from './config'

// config.ts's getStore() is a lazy module-level singleton — it only reads
// bootstrap.ts's data folder the first time any getter/setter is called.
// Keeping this to one test (rather than config.test.ts's per-test
// __setStoreForTests override pattern) exercises the real lazy-wiring
// path end to end, exactly once, so a second test in this file wouldn't
// accidentally reuse test 1's now-deleted temp dir.
describe('config.ts resolves its store location from bootstrap.ts data folder', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'data-folder-test-'))
    __setBootstrapStoreForTests(
      new Store({ name: `test-bootstrap-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
        typeof Store
      >[0])
    )
    setDataFolder(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('places config.json inside the configured data folder', () => {
    setCollectionFolder('/Users/dj/Music')
    expect(getConfigFilePath()).toBe(join(dir, 'config.json'))
    expect(getCollectionFolder()).toBe('/Users/dj/Music')
  })
})
