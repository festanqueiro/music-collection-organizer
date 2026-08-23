import { contextBridge, ipcRenderer } from 'electron'
import type {
  Track,
  Genre,
  Subgenre,
  BackupInfo,
  BackupEntry,
  ImportResult,
  GenreDeletionSnapshot,
  SubgenreDeletionSnapshot,
  EffectsSettings,
  MidiMappings,
  TrackTableColumnKey,
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
  getColumnOrder: (): Promise<TrackTableColumnKey[]> => ipcRenderer.invoke('config:getColumnOrder'),
  setColumnOrder: (order: TrackTableColumnKey[]): Promise<void> =>
    ipcRenderer.invoke('config:setColumnOrder', order),
  chooseCollectionFolder: (): Promise<string | null> => ipcRenderer.invoke('config:chooseCollectionFolder'),
  willRelocateOnNextCollectionFolderPick: (): Promise<boolean> =>
    ipcRenderer.invoke('config:willRelocateOnNextCollectionFolderPick'),
  getDbFilePath: (): Promise<string> => ipcRenderer.invoke('config:getDbFilePath'),
  // Resolves only if the user cancels the picker (null) — a successful
  // pick relaunches the whole app from the main process before this
  // invoke() would otherwise get a response, same as restoreBackup below.
  chooseDbLocation: (): Promise<string | null> => ipcRenderer.invoke('config:chooseDbLocation'),
  scanCollection: (): Promise<ScanResult> => ipcRenderer.invoke('scan:run'),
  analyzeCollection: (trackIds?: number[]): Promise<void> => ipcRenderer.invoke('analysis:run', trackIds),
  stopAnalysis: (): Promise<void> => ipcRenderer.invoke('analysis:stop'),
  getTracks: (): Promise<Track[]> => ipcRenderer.invoke('tracks:getAll'),
  getGenres: (): Promise<Genre[]> => ipcRenderer.invoke('tags:getGenres'),
  getSubgenres: (): Promise<Subgenre[]> => ipcRenderer.invoke('tags:getSubgenres'),
  getAllTagIds: (): Promise<TrackTagIds[]> => ipcRenderer.invoke('tracks:getAllTagIds'),
  createGenre: (name: string): Promise<number> => ipcRenderer.invoke('tags:createGenre', name),
  createSubgenre: (name: string, genreId: number): Promise<number> =>
    ipcRenderer.invoke('tags:createSubgenre', name, genreId),
  renameGenre: (genreId: number, name: string): Promise<void> => ipcRenderer.invoke('tags:renameGenre', genreId, name),
  renameSubgenre: (subgenreId: number, name: string): Promise<void> =>
    ipcRenderer.invoke('tags:renameSubgenre', subgenreId, name),
  setGenreColor: (genreId: number, color: string | null): Promise<void> =>
    ipcRenderer.invoke('tags:setGenreColor', genreId, color),
  countTracksWithGenre: (genreId: number): Promise<number> =>
    ipcRenderer.invoke('tags:countTracksWithGenre', genreId),
  countTracksWithSubgenre: (subgenreId: number): Promise<number> =>
    ipcRenderer.invoke('tags:countTracksWithSubgenre', subgenreId),
  deleteGenre: (genreId: number): Promise<GenreDeletionSnapshot> => ipcRenderer.invoke('tags:deleteGenre', genreId),
  undoDeleteGenre: (snapshot: GenreDeletionSnapshot): Promise<void> =>
    ipcRenderer.invoke('tags:undoDeleteGenre', snapshot),
  deleteSubgenre: (subgenreId: number): Promise<SubgenreDeletionSnapshot> =>
    ipcRenderer.invoke('tags:deleteSubgenre', subgenreId),
  undoDeleteSubgenre: (snapshot: SubgenreDeletionSnapshot): Promise<void> =>
    ipcRenderer.invoke('tags:undoDeleteSubgenre', snapshot),
  setTrackGenres: (trackId: number, genreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackGenres', trackId, genreIds),
  setTrackSubgenres: (trackId: number, subgenreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackSubgenres', trackId, subgenreIds),
  batchAddTags: (
    trackIds: number[],
    tagIds: { genreIds: number[]; subgenreIds: number[] }
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
  runBackupNow: (): Promise<BackupEntry> => ipcRenderer.invoke('backup:runNow'),
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
