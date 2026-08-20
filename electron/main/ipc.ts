import { ipcMain, dialog, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { getCollectionFolder, setCollectionFolder } from './config'
import { runScan } from './scan'
import {
  createGenre,
  createSubgenre,
  createMood,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
} from './tags'

function rowToTrack(row: any) {
  return {
    id: row.id,
    path: row.path,
    filename: row.filename,
    folder: row.folder,
    format: row.format,
    size: row.size,
    mtime: row.mtime,
    duration: row.duration,
    title: row.title,
    artist: row.artist,
    album: row.album,
    year: row.year,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    waveformPeaks: row.waveform_peaks ? JSON.parse(row.waveform_peaks) : null,
    cloudStatus: row.cloud_status,
    analysisStatus: row.analysis_status,
  }
}

export function registerIpcHandlers(db: Database.Database, mainWindow: BrowserWindow) {
  ipcMain.handle('config:getCollectionFolder', () => getCollectionFolder())

  ipcMain.handle('config:chooseCollectionFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    setCollectionFolder(folder)
    return folder
  })

  ipcMain.handle('scan:run', () => {
    const folder = getCollectionFolder()
    if (!folder) throw new Error('No collection folder configured')
    return runScan(db, folder)
  })

  ipcMain.handle('tracks:getAll', () => {
    return (db.prepare('SELECT * FROM tracks').all() as any[]).map(rowToTrack)
  })

  ipcMain.handle('tags:getGenres', () => db.prepare('SELECT * FROM genres').all())
  ipcMain.handle('tags:getSubgenres', () =>
    (db.prepare('SELECT * FROM subgenres').all() as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      genreId: r.genre_id,
    }))
  )
  ipcMain.handle('tags:getMoods', () => db.prepare('SELECT * FROM moods').all())

  ipcMain.handle('tags:createGenre', (_e, name: string) => createGenre(db, name))
  ipcMain.handle('tags:createSubgenre', (_e, name: string, genreId: number) => createSubgenre(db, name, genreId))
  ipcMain.handle('tags:createMood', (_e, name: string) => createMood(db, name))

  ipcMain.handle('tags:setTrackGenres', (_e, trackId: number, genreIds: number[]) =>
    setTrackGenres(db, trackId, genreIds)
  )
  ipcMain.handle('tags:setTrackSubgenres', (_e, trackId: number, subgenreIds: number[]) =>
    setTrackSubgenres(db, trackId, subgenreIds)
  )
  ipcMain.handle('tags:setTrackMoods', (_e, trackId: number, moodIds: number[]) =>
    setTrackMoods(db, trackId, moodIds)
  )
}
