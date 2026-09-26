import Store from 'electron-store'
import { getDataFolder } from './bootstrap'
import {
  DEFAULT_EFFECTS_SETTINGS,
  DEFAULT_SIREN_SETTINGS,
  DEFAULT_TRACK_TABLE_COLUMN_ORDER,
  type EffectsSettings,
  type MidiMappings,
  type TrackTableColumnKey,
  type TrackTableSortState,
  type ExternalBackupResult,
} from '../../src/types'
import { DEFAULT_APP_THEME, isAppThemeId, type AppThemeId } from '../../src/appThemes'

interface ConfigSchema {
  collectionFolder?: string
  lastBackupAt?: string
  lastBackupError?: string
  effectsSettings?: EffectsSettings
  midiMappings?: MidiMappings
  columnOrder?: string[]
  sortState?: TrackTableSortState
  audioOutputDeviceId?: string
  cueOutputDeviceId?: string
  autoCheckUpdates?: boolean
  watchCollectionFolder?: boolean
  autoAnalyseNewTracks?: boolean
  appTheme?: string
  externalBackupFolder?: string
  lastExternalBackup?: ExternalBackupResult
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
    masterVolume: stored.masterVolume ?? DEFAULT_EFFECTS_SETTINGS.masterVolume,
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
  const order = stored.filter((key): key is TrackTableColumnKey => known.has(key as TrackTableColumnKey))
  // A column the stored order doesn't have (added in a later version) goes
  // right after the column it follows by default — e.g. Subtags after
  // Tags — or first if that one isn't there either.
  DEFAULT_TRACK_TABLE_COLUMN_ORDER.forEach((key, i) => {
    if (order.includes(key)) return
    const after = DEFAULT_TRACK_TABLE_COLUMN_ORDER.slice(0, i).reverse().find((k) => order.includes(k))
    order.splice(after ? order.indexOf(after) + 1 : 0, 0, key)
  })
  return order
}

export function setColumnOrder(order: TrackTableColumnKey[]): void {
  getStore().set('columnOrder', order)
}

// Falls back to the table's default sort (title/ascending) rather than
// throwing if a stored key names a column removed in a later app version
// — same reconciliation reasoning as getColumnOrder above.
export function getSortState(): TrackTableSortState {
  const stored = getStore().get('sortState')
  const known = new Set(DEFAULT_TRACK_TABLE_COLUMN_ORDER)
  if (stored && known.has(stored.key as TrackTableColumnKey)) {
    return { key: stored.key as TrackTableColumnKey, direction: stored.direction }
  }
  return { key: 'title', direction: 'asc' }
}

export function setSortState(state: TrackTableSortState): void {
  getStore().set('sortState', state)
}

// null means "system default output device" — the normal, unset state.
export function getAudioOutputDeviceId(): string | null {
  return getStore().get('audioOutputDeviceId') ?? null
}

export function setAudioOutputDeviceId(deviceId: string | null): void {
  if (deviceId === null) getStore().delete('audioOutputDeviceId')
  else getStore().set('audioOutputDeviceId', deviceId)
}

// On by default: the app checks GitHub for a newer release shortly after
// launch and every few hours (see updater.ts). It never installs without
// the user clicking Update.
export function getAutoCheckUpdates(): boolean {
  return getStore().get('autoCheckUpdates') ?? true
}

export function setAutoCheckUpdates(enabled: boolean): void {
  getStore().set('autoCheckUpdates', enabled)
}

// Folder watcher (folderWatcher.ts): on by default, so new downloads show
// up on their own. Analysing what it finds is opt-in, like every other
// bulk analysis in the app.
export function getWatchCollectionFolder(): boolean {
  return getStore().get('watchCollectionFolder') ?? true
}

export function setWatchCollectionFolder(enabled: boolean): void {
  getStore().set('watchCollectionFolder', enabled)
}

// In config (not the renderer's localStorage) because main needs it
// before the window exists: its background colour and the preload's
// first-paint theme (see index.ts's createWindow).
export function getAppThemeId(): AppThemeId {
  const stored = getStore().get('appTheme')
  return isAppThemeId(stored) ? stored : DEFAULT_APP_THEME
}

export function setAppThemeId(id: AppThemeId): void {
  getStore().set('appTheme', id)
}

export function getExternalBackupFolder(): string | null {
  return getStore().get('externalBackupFolder') ?? null
}

export function setExternalBackupFolder(folder: string): void {
  getStore().set('externalBackupFolder', folder)
}

export function getLastExternalBackup(): ExternalBackupResult | null {
  return getStore().get('lastExternalBackup') ?? null
}

export function setLastExternalBackup(result: ExternalBackupResult): void {
  getStore().set('lastExternalBackup', result)
}

export function getAutoAnalyseNewTracks(): boolean {
  return getStore().get('autoAnalyseNewTracks') ?? false
}

export function setAutoAnalyseNewTracks(enabled: boolean): void {
  getStore().set('autoAnalyseNewTracks', enabled)
}

// Headphone pre-listen output. null means "system default".
export function getCueOutputDeviceId(): string | null {
  return getStore().get('cueOutputDeviceId') ?? null
}

export function setCueOutputDeviceId(deviceId: string | null): void {
  if (deviceId === null) getStore().delete('cueOutputDeviceId')
  else getStore().set('cueOutputDeviceId', deviceId)
}
