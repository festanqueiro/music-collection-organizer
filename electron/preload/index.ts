import { contextBridge, ipcRenderer } from 'electron'
import type { Track, Genre, Subgenre, Mood, BackupInfo, BackupEntry } from '../../src/types'
import type { TrackTagIds } from '../../src/state/tagFilter'
import type { ScanResult } from '../main/scan'

const api = {
  getCollectionFolder: (): Promise<string | null> => ipcRenderer.invoke('config:getCollectionFolder'),
  chooseCollectionFolder: (): Promise<string | null> => ipcRenderer.invoke('config:chooseCollectionFolder'),
  scanCollection: (): Promise<ScanResult> => ipcRenderer.invoke('scan:run'),
  getTracks: (): Promise<Track[]> => ipcRenderer.invoke('tracks:getAll'),
  getGenres: (): Promise<Genre[]> => ipcRenderer.invoke('tags:getGenres'),
  getSubgenres: (): Promise<Subgenre[]> => ipcRenderer.invoke('tags:getSubgenres'),
  getMoods: (): Promise<Mood[]> => ipcRenderer.invoke('tags:getMoods'),
  getAllTagIds: (): Promise<TrackTagIds[]> => ipcRenderer.invoke('tracks:getAllTagIds'),
  createGenre: (name: string): Promise<number> => ipcRenderer.invoke('tags:createGenre', name),
  createSubgenre: (name: string, genreId: number): Promise<number> =>
    ipcRenderer.invoke('tags:createSubgenre', name, genreId),
  createMood: (name: string): Promise<number> => ipcRenderer.invoke('tags:createMood', name),
  deleteGenre: (genreId: number): Promise<void> => ipcRenderer.invoke('tags:deleteGenre', genreId),
  setTrackGenres: (trackId: number, genreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackGenres', trackId, genreIds),
  setTrackSubgenres: (trackId: number, subgenreIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackSubgenres', trackId, subgenreIds),
  setTrackMoods: (trackId: number, moodIds: number[]): Promise<TrackTagIds> =>
    ipcRenderer.invoke('tags:setTrackMoods', trackId, moodIds),
  // Only a trackId — the main process looks up the actual path from its
  // own DB row rather than trusting one supplied over IPC.
  downloadTrack: (trackId: number): Promise<void> => ipcRenderer.invoke('tracks:download', trackId),
  getBackupInfo: (): Promise<BackupInfo> => ipcRenderer.invoke('backup:getInfo'),
  listBackups: (): Promise<BackupEntry[]> => ipcRenderer.invoke('backup:list'),
  restoreBackup: (timestamp: string): Promise<void> => ipcRenderer.invoke('backup:restore', timestamp),
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
