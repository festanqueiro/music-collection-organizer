import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { AppDatabase } from './db'
import { getCollectionFolder, setCollectionFolder } from './config'
import { runScan } from './scan'
import { downloadTrack } from './cloudDownload'
import { runAnalysisQueue } from './analysis/queue'
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
    genreTag: row.genre_tag,
    year: row.year,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    waveformPeaks: row.waveform_peaks ? JSON.parse(row.waveform_peaks) : null,
    cloudStatus: row.cloud_status,
    analysisStatus: row.analysis_status,
  }
}

export function registerIpcHandlers(db: AppDatabase, mainWindow: BrowserWindow) {
  ipcMain.handle('config:getCollectionFolder', () => getCollectionFolder())

  ipcMain.handle('config:chooseCollectionFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    setCollectionFolder(folder)
    return folder
  })

  ipcMain.handle('scan:run', async () => {
    const folder = getCollectionFolder()
    if (!folder) throw new Error('No collection folder configured')
    const result = runScan(db, folder)

    const pending = db
      .prepare(`SELECT id, path FROM tracks WHERE analysis_status = 'pending' AND cloud_status = 'local'`)
      .all() as { id: number; path: string }[]

    if (pending.length > 0) {
      runAnalysisQueue(db, pending, {
        concurrency: 4,
        onProgress: (progress) => {
          mainWindow.webContents.send('scan:progress', progress)
        },
      })
        .catch((err) => {
          console.error('analysis queue failed', err)
        })
        .finally(() => {
          mainWindow.webContents.send('scan:progress', { done: pending.length, total: pending.length })
        })
    }

    return result
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

  ipcMain.handle('tracks:download', async (_e, trackId: number, path: string) => {
    await downloadTrack(db, { id: trackId, path })
  })

  ipcMain.handle('tracks:getAllTagIds', () => {
    const rows = db
      .prepare(
        `SELECT track_id, genre_id, NULL as subgenre_id, NULL as mood_id FROM track_genres
         UNION ALL
         SELECT track_id, NULL, subgenre_id, NULL FROM track_subgenres
         UNION ALL
         SELECT track_id, NULL, NULL, mood_id FROM track_moods`
      )
      .all() as any[]
    const byTrack = new Map<number, { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }>()
    for (const row of rows) {
      if (!byTrack.has(row.track_id)) byTrack.set(row.track_id, { genreIds: [], subgenreIds: [], moodIds: [] })
      const entry = byTrack.get(row.track_id)!
      if (row.genre_id) entry.genreIds.push(row.genre_id)
      if (row.subgenre_id) entry.subgenreIds.push(row.subgenre_id)
      if (row.mood_id) entry.moodIds.push(row.mood_id)
    }
    return Array.from(byTrack.entries()).map(([trackId, tags]) => ({ trackId, ...tags }))
  })
}
