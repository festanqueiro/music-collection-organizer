import Store from 'electron-store'
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
    store = new Store<ConfigSchema>({ name: 'config' })
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

// A config written before the siren module existed has no `siren` key —
// settings.siren.mode would throw in the renderer without this merge.
// Depth-one is enough: delay/reverb/siren are each flat objects of
// primitives, so a stored sub-object's own fields always take precedence
// over defaults, and only a genuinely missing sub-object falls back
// wholesale.
export function getEffectsSettings(): EffectsSettings {
  const stored = getStore().get('effectsSettings')
  if (!stored) return DEFAULT_EFFECTS_SETTINGS
  return {
    ...DEFAULT_EFFECTS_SETTINGS,
    ...stored,
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
