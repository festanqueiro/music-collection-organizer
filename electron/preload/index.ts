import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getCollectionFolder: () => ipcRenderer.invoke('config:getCollectionFolder'),
  chooseCollectionFolder: () => ipcRenderer.invoke('config:chooseCollectionFolder'),
  scanCollection: () => ipcRenderer.invoke('scan:run'),
  getTracks: () => ipcRenderer.invoke('tracks:getAll'),
  getGenres: () => ipcRenderer.invoke('tags:getGenres'),
  getSubgenres: () => ipcRenderer.invoke('tags:getSubgenres'),
  getMoods: () => ipcRenderer.invoke('tags:getMoods'),
  createGenre: (name: string) => ipcRenderer.invoke('tags:createGenre', name),
  createSubgenre: (name: string, genreId: number) => ipcRenderer.invoke('tags:createSubgenre', name, genreId),
  createMood: (name: string) => ipcRenderer.invoke('tags:createMood', name),
  setTrackGenres: (trackId: number, genreIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackGenres', trackId, genreIds),
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackSubgenres', trackId, subgenreIds),
  setTrackMoods: (trackId: number, moodIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackMoods', trackId, moodIds),
  downloadTrack: (trackId: number, path: string) => ipcRenderer.invoke('tracks:download', trackId, path),
  onScanProgress: (cb: (progress: { done: number; total: number }) => void) => {
    const listener = (_e: unknown, progress: { done: number; total: number }) => cb(progress)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
