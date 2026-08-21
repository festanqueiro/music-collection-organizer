import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_SIREN_SETTINGS } from '../../src/types'
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  setLastBackupAt,
  getConfigFilePath,
  getLastBackupError,
  setLastBackupError,
  clearLastBackupError,
  getEffectsSettings,
  setEffectsSettings,
  getMidiMappings,
  setMidiMappings,
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

  it('returns null lastBackupError when unset', () => {
    expect(getLastBackupError()).toBeNull()
  })

  it('persists a set lastBackupError', () => {
    setLastBackupError('ENOSPC: no space left on device')
    expect(getLastBackupError()).toBe('ENOSPC: no space left on device')
  })

  it('clears lastBackupError', () => {
    setLastBackupError('some error')
    clearLastBackupError()
    expect(getLastBackupError()).toBeNull()
  })

  it('returns the default effects settings when unset', () => {
    expect(getEffectsSettings()).toEqual(DEFAULT_EFFECTS_SETTINGS)
  })

  it('persists a set effects settings', () => {
    const settings = {
      delay: { enabled: true, timeMs: 500, feedback: 0.5, mix: 0.6 },
      reverb: { enabled: true, mix: 0.4 },
      siren: { ...DEFAULT_SIREN_SETTINGS, enabled: true, mode: 'bomb' as const },
    }
    setEffectsSettings(settings)
    expect(getEffectsSettings()).toEqual(settings)
  })

  it('merges in full siren defaults for a stored blob with no siren key at all (pre-siren config)', () => {
    // Bypasses setEffectsSettings (which always writes a valid, current-
    // shape EffectsSettings) to simulate a config file saved before the
    // siren module existed.
    const store = new Store({ name: `test-presiren-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('effectsSettings', { delay: DEFAULT_EFFECTS_SETTINGS.delay, reverb: DEFAULT_EFFECTS_SETTINGS.reverb })
    __setStoreForTests(store)
    expect(getEffectsSettings().siren).toEqual(DEFAULT_SIREN_SETTINGS)
  })

  it('keeps a partial stored siren object\'s own values, filling only what is missing', () => {
    const store = new Store({ name: `test-partial-siren-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('effectsSettings', {
      delay: DEFAULT_EFFECTS_SETTINGS.delay,
      reverb: DEFAULT_EFFECTS_SETTINGS.reverb,
      siren: { enabled: true, mode: 'laser' },
    })
    __setStoreForTests(store)
    expect(getEffectsSettings().siren).toEqual({ ...DEFAULT_SIREN_SETTINGS, enabled: true, mode: 'laser' })
  })

  it('returns an empty object for midi mappings when unset', () => {
    expect(getMidiMappings()).toEqual({})
  })

  it('persists set midi mappings', () => {
    const mappings = { volume: { channel: 0, controller: 7 }, 'delay.mix': { channel: 1, controller: 12 } }
    setMidiMappings(mappings)
    expect(getMidiMappings()).toEqual(mappings)
  })
})
