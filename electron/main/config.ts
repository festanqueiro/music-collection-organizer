import Store from 'electron-store'
import { getDataFolder } from './bootstrap'
import {
  DEFAULT_EFFECTS_SETTINGS,
  DEFAULT_SIREN_SETTINGS,
  DEFAULT_TRACK_TABLE_COLUMN_ORDER,
  type EffectsSettings,
  type MidiMappings,
  type TrackTableColumnKey,
} from '../../src/types'

interface ConfigSchema {
  collectionFolder?: string
  lastBackupAt?: string
  lastBackupError?: string
  effectsSettings?: EffectsSettings
  midiMappings?: MidiMappings
  columnOrder?: string[]
}

let store: Store<ConfigSchema> | null = null

function getStore(): Store<ConfigSchema> {
  if (!store) {
    // getDataFolder() (bootstrap.ts) says where the *whole data folder*
    // (config.json + collection.db together) currently lives — null means
    // "still on the default (userData)". This is what lets the DB and
    // settings both relocate into the collection folder together (see
    // dataMigration.ts's migrateDataFolder) without this module needing
    // to know anything about collection folders or migration itself.
    const dataFolder = getDataFolder()
    store = new Store<ConfigSchema>(dataFolder ? { name: 'config', cwd: dataFolder } : { name: 'config' })
  }
  return store
}

export function __setStoreForTests(testStore: Store<ConfigSchema>) {
  store = testStore
}

export function getCollectionFolder(): string | null {
  return getStore().get('collectionFolder') ?? null
}

export function setCollectionFolder(path: string): void {
  getStore().set('collectionFolder', path)
}

export function getLastBackupAt(): string | null {
  return getStore().get('lastBackupAt') ?? null
}

export function setLastBackupAt(iso: string): void {
  getStore().set('lastBackupAt', iso)
}

export function getConfigFilePath(): string {
  return getStore().path
}

export function getLastBackupError(): string | null {
  return getStore().get('lastBackupError') ?? null
}

export function setLastBackupError(message: string): void {
  getStore().set('lastBackupError', message)
}

export function clearLastBackupError(): void {
  getStore().delete('lastBackupError')
}

// A config written before a field/module existed is missing it entirely
// (e.g. no `siren` key at all before that module shipped, or a `reverb`
// with no `decaySeconds`/`preDelayMs` from before those were added) —
// reading it as-is would either throw in the renderer or leave a field
// `undefined`. Every sub-object is deep-merged one level against its own
// defaults (they're each flat objects of primitives, so one level is
// enough) rather than only the top-level EffectsSettings spread, which
// would silently replace a whole stored sub-object and lose this exact
// protection for any field added to it after the fact — reverb.decaySeconds
// was briefly exposed to that gap before this comment was written.
export function getEffectsSettings(): EffectsSettings {
  const stored = getStore().get('effectsSettings')
  if (!stored) return DEFAULT_EFFECTS_SETTINGS
  return {
    delay: { ...DEFAULT_EFFECTS_SETTINGS.delay, ...stored.delay },
    reverb: { ...DEFAULT_EFFECTS_SETTINGS.reverb, ...stored.reverb },
    filter: { ...DEFAULT_EFFECTS_SETTINGS.filter, ...stored.filter },
    eq: { ...DEFAULT_EFFECTS_SETTINGS.eq, ...stored.eq },
    siren: { ...DEFAULT_SIREN_SETTINGS, ...stored.siren },
  }
}

export function setEffectsSettings(settings: EffectsSettings): void {
  getStore().set('effectsSettings', settings)
}

export function getMidiMappings(): MidiMappings {
  return getStore().get('midiMappings') ?? {}
}

export function setMidiMappings(mappings: MidiMappings): void {
  getStore().set('midiMappings', mappings)
}

// Reconciled against the current known column set on every read, not just
// validated on write: a column added in a later app version needs to show
// up (appended at the end) even in a profile whose stored order predates
// it, and a column since removed needs to silently drop out rather than
// leaving a dead entry the table can't render.
export function getColumnOrder(): TrackTableColumnKey[] {
  const stored = getStore().get('columnOrder') ?? []
  const known = new Set(DEFAULT_TRACK_TABLE_COLUMN_ORDER)
  const kept = stored.filter((key): key is TrackTableColumnKey => known.has(key as TrackTableColumnKey))
  const missing = DEFAULT_TRACK_TABLE_COLUMN_ORDER.filter((key) => !kept.includes(key))
  return [...kept, ...missing]
}

export function setColumnOrder(order: TrackTableColumnKey[]): void {
  getStore().set('columnOrder', order)
}
