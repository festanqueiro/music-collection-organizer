import Store from 'electron-store'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_SIREN_SETTINGS, type EffectsSettings, type MidiMappings } from '../../src/types'

interface ConfigSchema {
  collectionFolder?: string
  lastBackupAt?: string
  lastBackupError?: string
  effectsSettings?: EffectsSettings
  midiMappings?: MidiMappings
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
