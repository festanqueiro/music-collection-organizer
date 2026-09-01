import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_SIREN_SETTINGS, DEFAULT_TRACK_TABLE_COLUMN_ORDER } from '../../src/types'
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
  getColumnOrder,
  setColumnOrder,
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
      reverb: { enabled: true, mix: 0.4, decaySeconds: 3, preDelayMs: 20 },
      filter: { enabled: true, lowpass: 0.5, highpass: 0, resonance: 3 },
      eq: { enabled: true, low: 4, mid: -2, high: 1.5, mix: 1 },
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

  it('fills in reverb fields missing from a stored blob predating them (decaySeconds/preDelayMs)', () => {
    const store = new Store({ name: `test-old-reverb-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('effectsSettings', {
      delay: DEFAULT_EFFECTS_SETTINGS.delay,
      reverb: { enabled: true, mix: 0.5 },
      siren: DEFAULT_SIREN_SETTINGS,
    })
    __setStoreForTests(store)
    expect(getEffectsSettings().reverb).toEqual({
      enabled: true,
      mix: 0.5,
      decaySeconds: DEFAULT_EFFECTS_SETTINGS.reverb.decaySeconds,
      preDelayMs: DEFAULT_EFFECTS_SETTINGS.reverb.preDelayMs,
    })
  })

  it('fills in the whole filter default for a stored blob with no filter key at all (pre-filter config)', () => {
    const store = new Store({ name: `test-prefilter-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('effectsSettings', {
      delay: DEFAULT_EFFECTS_SETTINGS.delay,
      reverb: DEFAULT_EFFECTS_SETTINGS.reverb,
      siren: DEFAULT_SIREN_SETTINGS,
    })
    __setStoreForTests(store)
    expect(getEffectsSettings().filter).toEqual(DEFAULT_EFFECTS_SETTINGS.filter)
  })

  it('fills in the whole eq default for a stored blob with no eq key at all (pre-eq config)', () => {
    const store = new Store({ name: `test-preeq-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('effectsSettings', {
      delay: DEFAULT_EFFECTS_SETTINGS.delay,
      reverb: DEFAULT_EFFECTS_SETTINGS.reverb,
      filter: DEFAULT_EFFECTS_SETTINGS.filter,
      siren: DEFAULT_SIREN_SETTINGS,
    })
    __setStoreForTests(store)
    expect(getEffectsSettings().eq).toEqual(DEFAULT_EFFECTS_SETTINGS.eq)
  })

  it('returns an empty object for midi mappings when unset', () => {
    expect(getMidiMappings()).toEqual({})
  })

  it('persists set midi mappings', () => {
    const mappings = { volume: { channel: 0, controller: 7 }, 'delay.mix': { channel: 1, controller: 12 } }
    setMidiMappings(mappings)
    expect(getMidiMappings()).toEqual(mappings)
  })

  it('returns the default column order when unset', () => {
    expect(getColumnOrder()).toEqual(DEFAULT_TRACK_TABLE_COLUMN_ORDER)
  })

  it('persists a set column order', () => {
    const order = [
      'artist',
      'title',
      'bpm',
      'musicalKey',
      'format',
      'duration',
      'filename',
      'tags',
      'dateAdded',
      'dateModified',
    ] as const
    setColumnOrder([...order])
    expect(getColumnOrder()).toEqual(order)
  })

  it('appends a column missing from a stored order (added in a later app version)', () => {
    const store = new Store({ name: `test-missing-col-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('columnOrder', ['artist', 'title'])
    __setStoreForTests(store)
    const result = getColumnOrder()
    expect(result.slice(0, 2)).toEqual(['artist', 'title'])
    expect(result).toHaveLength(DEFAULT_TRACK_TABLE_COLUMN_ORDER.length)
    expect(new Set(result)).toEqual(new Set(DEFAULT_TRACK_TABLE_COLUMN_ORDER))
  })

  it('drops an unknown column from a stored order (removed in a later app version)', () => {
    const store = new Store({ name: `test-unknown-col-${Math.random()}`, projectName: 'v1-library-organizer' } as ConstructorParameters<
      typeof Store
    >[0])
    store.set('columnOrder', ['artist', 'someRemovedColumn', 'title'])
    __setStoreForTests(store)
    expect(getColumnOrder()).not.toContain('someRemovedColumn')
  })
})
