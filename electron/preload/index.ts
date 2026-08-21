import { contextBridge, ipcRenderer } from 'electron'
import type {
  Track,
  Genre,
  Subgenre,
  Mood,
  BackupInfo,
  BackupEntry,
  ImportResult,
  GenreDeletionSnapshot,
  EffectsSettings,
  MidiMappings,
} from '../../src/types'
import type { TrackTagIds } from '../../src/state/tagFilter'
import type { ScanResult } from '../main/scan'

const api = {
  getCollectionFolder: (): Promise<string | null> => ipcRenderer.invoke('config:getCollectionFolder'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getEffectsSettings: (): Promise<EffectsSettings> => ipcRenderer.invoke('config:getEffectsSettings'),
  setEffectsSettings: (settings: EffectsSettings): Promise<void> =>
    ipcRenderer.invoke('config:setEffectsSettings', settings),
  getMidiMappings: (): Promise<MidiMappings> => ipcRenderer.invoke('config:getMidiMappings'),
  setMidiMappings: (mappings: MidiMappings): Promise<void> =>
    ipcRenderer.invoke('config:setMidiMappings', mappings),
  chooseCollectionFolder: (): Promise<string | null> => ipcRenderer.invoke('config:chooseCollectionFolder'),
  scanCollection: (): Promise<ScanResult> => ipcRenderer.invoke('scan:run'),
  analyzeCollection: (trackIds?: number[]): Promise<void> => ipcRenderer.invoke('analysis:run', trackIds),
  stopAnalysis: (): Promise<void> => ipcRenderer.invoke('analysis:stop'),
  getTracks: (): Promise<Track[]> => ipcRenderer.invoke('tracks:getAll'),
  getGenres: (): Promise<Genre[]> => ipcRenderer.invoke('tags:getGenres'),
  getSubgenres: (): Promise<Subgenre[]> => ipcRenderer.invoke('tags:getSubgenres'),
  getMoods: (): Promise<Mood[]> => ipcRenderer.invoke('tags:getMoods'),
  getAllTagIds: (): Promise<TrackTagIds[]> => ipcRenderer.invoke('tracks:getAllTagIds'),
  createGenre: (name: string): Promise<number> => ipcRenderer.invoke('tags:createGenre', name),
  createSubgenre: (name: string, genreId: number): Promise<number> =>
    ipcRenderer.invoke('tags:createSubgenre', name, genreId),
  createMood: (name: string): Promise<number> => ipcRenderer.invoke('tags:createMood', name),
  deleteGenre: (genreId: number): Promise<GenreDeletionSnapshot> => ipcRenderer.invoke('tags:deleteGenre', genreId),
  undoDeleteGenre: (snapshot: GenreDeletionSnapshot): Promise<void> =>
    ipcRenderer.invoke('tags:undoDeleteGenre', snapshot),
  setTrackGenres: (trackId: number, genreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackGenres', trackId, genreIds),
  setTrackSubgenres: (trackId: number, subgenreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackSubgenres', trackId, subgenreIds),
  setTrackMoods: (trackId: number, moodIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackMoods', trackId, moodIds),
  batchAddTags: (
    trackIds: number[],
    tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }
  ): Promise<TrackTagIds[]> => ipcRenderer.invoke('tags:batchAddTags', trackIds, tagIds),
  // Only a trackId — the main process looks up the actual path from its
  // own DB row rather than trusting one supplied over IPC.
  downloadTrack: (trackId: number): Promise<void> => ipcRenderer.invoke('tracks:download', trackId),
  // Fire-and-forget: kicks off the OS's native file-drag session for this
  // track's row, same mechanism as dragging a file out of Finder — no
  // response is awaited.
  startTrackDrag: (trackId: number): void => ipcRenderer.send('tracks:startDrag', trackId),
  showTrackInFolder: (trackId: number): void => ipcRenderer.send('tracks:showInFolder', trackId),
  getTrackArtwork: (trackId: number): Promise<string | null> => ipcRenderer.invoke('tracks:getArtwork', trackId),
  getBackupInfo: (): Promise<BackupInfo> => ipcRenderer.invoke('backup:getInfo'),
  listBackups: (): Promise<BackupEntry[]> => ipcRenderer.invoke('backup:list'),
  restoreBackup: (timestamp: string): Promise<void> => ipcRenderer.invoke('backup:restore', timestamp),
  exportTagData: (): Promise<{ path: string } | null> => ipcRenderer.invoke('tags:exportData'),
  importTagData: (): Promise<ImportResult | null> => ipcRenderer.invoke('tags:importData'),
  onScanProgress: (cb: (progress: { done: number; total: number }) => void): (() => void) => {
    const listener = (_e: unknown, progress: { done: number; total: number }) => cb(progress)
    ipcRenderer.on('scan:progress', listener)
    return () => {
      ipcRenderer.removeListener('scan:progress', listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
