import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { writeFileSync, readFileSync } from 'node:fs'
import type { AppDatabase } from './db'
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  getLastBackupError,
  getConfigFilePath,
  getEffectsSettings,
  setEffectsSettings,
  getMidiMappings,
  setMidiMappings,
} from './config'
import { runScan, type ScanResult } from './scan'
import { downloadTrack } from './cloudDownload'
import { getDragIcon } from './dragIcon'
import { runAnalysisQueue } from './analysis/queue'
import { listBackups, restoreBackup } from './backup'
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
  captureGenreDeletionSnapshot,
  undoGenreDeletion,
} from './tags'
import { exportTagData, importTagData, type TagExportData } from './tagExport'
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

interface TrackRow {
  id: number
  path: string
  filename: string
  folder: string
  format: string
  size: number
  mtime: number
  duration: number | null
  title: string | null
  artist: string | null
  album: string | null
  genre_tag: string | null
  year: number | null
  bpm: number | null
  musical_key: string | null
  waveform_peaks: string | null
  cloud_status: 'local' | 'cloud_only'
  analysis_status: 'pending' | 'analyzing' | 'done' | 'error'
}

interface GenreRow {
  id: number
  name: string
}

interface SubgenreRow {
  id: number
  name: string
  genre_id: number
}

interface MoodRow {
  id: number
  name: string
}

function rowToTrack(row: TrackRow): Track {
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

// getMainWindow is a function (not a fixed BrowserWindow) so a window
// recreated after all windows were closed (macOS's 'activate' event) is
// always the one dialogs/events target — a captured reference to the
// original window would be a destroyed BrowserWindow after that point.
export function registerIpcHandlers(db: AppDatabase, getMainWindow: () => BrowserWindow, backupFolder: string) {
  // Guards scan:run against overlapping runs.
  let scanInProgress = false
  // Guards analysis:run against overlapping runs, and gives analysis:stop
  // something to abort — non-null exactly while an analysis is in flight.
  let analysisAbortController: AbortController | null = null

  ipcMain.handle('config:getCollectionFolder', (): string | null => getCollectionFolder())

  ipcMain.handle('app:getVersion', (): string => app.getVersion())

  ipcMain.handle('config:getEffectsSettings', (): EffectsSettings => getEffectsSettings())
  ipcMain.handle('config:setEffectsSettings', (_e, settings: EffectsSettings): void =>
    setEffectsSettings(settings)
  )

  ipcMain.handle('config:getMidiMappings', (): MidiMappings => getMidiMappings())
  ipcMain.handle('config:setMidiMappings', (_e, mappings: MidiMappings): void => setMidiMappings(mappings))

  ipcMain.handle('backup:getInfo', (): BackupInfo => ({
    backupFolder,
    lastBackupAt: getLastBackupAt(),
    lastBackupError: getLastBackupError(),
  }))

  ipcMain.handle('backup:list', (): BackupEntry[] => listBackups(backupFolder))

  ipcMain.handle('backup:restore', (_e, timestamp: string): void => {
    const entry = listBackups(backupFolder).find((e) => e.timestamp === timestamp)
    if (!entry) throw new Error(`No backup found for timestamp ${timestamp}`)
    db.close()
    const dbFilePath = join(app.getPath('userData'), 'collection.db')
    restoreBackup(entry, dbFilePath, getConfigFilePath())
    app.relaunch()
    app.exit()
  })

  ipcMain.handle('config:chooseCollectionFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    setCollectionFolder(folder)
    return folder
  })

  // File discovery/diff only — does NOT trigger analysis. Analysis is a
  // separate, explicit action (analysis:run below) so picking a folder or
  // clicking "Update Collection" never kicks off a bulk BPM/waveform run
  // the user didn't ask for.
  ipcMain.handle('scan:run', async (): Promise<ScanResult> => {
    if (scanInProgress) throw new Error('A scan is already in progress')
    scanInProgress = true
    try {
      const folder = getCollectionFolder()
      if (!folder) throw new Error('No collection folder configured')
      return runScan(db, folder)
    } finally {
      scanInProgress = false
    }
  })

  // trackIds: analyze exactly these tracks (e.g. a batch selection in the
  // UI), regardless of their current analysis_status — an explicit
  // "analyze this" request always re-runs, since the user asked for it
  // directly. Omitted: analyze every 'pending'/'error' track in the
  // collection (also retries past failures, e.g. from a since-fixed bug).
  // Either way, only 'local' tracks — a cloud-only placeholder has no
  // real audio to analyze yet.
  ipcMain.handle('analysis:run', async (_e, trackIds?: number[]): Promise<void> => {
    if (analysisAbortController) throw new Error('Analysis is already in progress')

    const tracks =
      trackIds && trackIds.length > 0
        ? (db
            .prepare(
              `SELECT id, path FROM tracks WHERE cloud_status = 'local' AND id IN (${trackIds.map(() => '?').join(',')})`
            )
            .all(...trackIds) as { id: number; path: string }[])
        : (db
            .prepare(
              `SELECT id, path FROM tracks WHERE analysis_status IN ('pending', 'error') AND cloud_status = 'local'`
            )
            .all() as { id: number; path: string }[])

    if (tracks.length === 0) return

    analysisAbortController = new AbortController()
    try {
      await runAnalysisQueue(db, tracks, {
        concurrency: 4,
        onProgress: (progress) => {
          getMainWindow().webContents.send('scan:progress', progress)
        },
        signal: analysisAbortController.signal,
      })
    } finally {
      getMainWindow().webContents.send('scan:progress', { done: tracks.length, total: tracks.length })
      analysisAbortController = null
    }
  })

  ipcMain.handle('analysis:stop', (): void => {
    analysisAbortController?.abort()
  })

  ipcMain.handle('tracks:getAll', (): Track[] => {
    // present = 0 tracks are ones runScan couldn't find on disk in the most
    // recent scan (moved, temporarily unmounted, or the collection folder
    // changed) — hidden here, but never deleted, so their tags survive.
    return (db.prepare('SELECT * FROM tracks WHERE present = 1').all() as unknown as TrackRow[]).map(rowToTrack)
  })

  ipcMain.handle('tags:getGenres', (): Genre[] => db.prepare('SELECT * FROM genres').all() as unknown as GenreRow[])
  ipcMain.handle('tags:getSubgenres', (): Subgenre[] =>
    (db.prepare('SELECT * FROM subgenres').all() as unknown as SubgenreRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      genreId: r.genre_id,
    }))
  )
  ipcMain.handle('tags:getMoods', (): Mood[] => db.prepare('SELECT * FROM moods').all() as unknown as MoodRow[])

  ipcMain.handle('tags:createGenre', (_e, name: string): number => createGenre(db, name))
  ipcMain.handle('tags:createSubgenre', (_e, name: string, genreId: number): number =>
    createSubgenre(db, name, genreId)
  )
  ipcMain.handle('tags:createMood', (_e, name: string): number => createMood(db, name))
  ipcMain.handle('tags:deleteGenre', (_e, genreId: number): GenreDeletionSnapshot => {
    const snapshot = captureGenreDeletionSnapshot(db, genreId)
    deleteGenre(db, genreId)
    return snapshot
  })
  ipcMain.handle('tags:undoDeleteGenre', (_e, snapshot: GenreDeletionSnapshot): void =>
    undoGenreDeletion(db, snapshot)
  )

  // These return the post-write tag state (read back from the DB) rather
  // than void, so the renderer store can apply the server's answer directly
  // instead of reimplementing setTrackGenres's subgenre-cascade rule
  // client-side against a possibly-stale cache.
  ipcMain.handle('tags:setTrackGenres', (_e, trackId: number, genreIds: number[]): TrackTagIds => {
    setTrackGenres(db, trackId, genreIds)
    return { trackId, ...getTrackTagIds(db, trackId) }
  })
  ipcMain.handle('tags:setTrackSubgenres', (_e, trackId: number, subgenreIds: number[]): TrackTagIds => {
    setTrackSubgenres(db, trackId, subgenreIds)
    return { trackId, ...getTrackTagIds(db, trackId) }
  })
  ipcMain.handle('tags:setTrackMoods', (_e, trackId: number, moodIds: number[]): TrackTagIds => {
    setTrackMoods(db, trackId, moodIds)
    return { trackId, ...getTrackTagIds(db, trackId) }
  })

  ipcMain.handle(
    'tags:batchAddTags',
    (
      _e,
      trackIds: number[],
      tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }
    ): TrackTagIds[] => {
      if (tagIds.genreIds.length) addGenresToTracks(db, trackIds, tagIds.genreIds)
      if (tagIds.subgenreIds.length) addSubgenresToTracks(db, trackIds, tagIds.subgenreIds)
      if (tagIds.moodIds.length) addMoodsToTracks(db, trackIds, tagIds.moodIds)
      return trackIds.map((trackId) => ({ trackId, ...getTrackTagIds(db, trackId) }))
    }
  )

  ipcMain.handle('tracks:download', async (_e, trackId: number): Promise<void> => {
    await downloadTrack(db, trackId)
  })

  // Native OS file drag (e.g. dragging a row out to Finder, a DAW, or any
  // other app) — this hands the OS the track's existing on-disk path, the
  // same as dragging a file out of Finder itself. Nothing is copied or
  // moved by this app; the receiving app/Finder decides what happens next,
  // exactly like any other native file drag. `ipcMain.on` (not `handle`)
  // matches Electron's own recipe for startDrag: fire-and-forget, no
  // renderer-side await needed.
  ipcMain.on('tracks:startDrag', (event, trackId: number) => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId) as { path: string } | undefined
    if (!row) return
    event.sender.startDrag({ file: row.path, icon: getDragIcon() })
  })

  ipcMain.handle('tracks:getAllTagIds', (): TrackTagIds[] => {
    const rows = db
      .prepare(
        `SELECT track_id, genre_id, NULL as subgenre_id, NULL as mood_id FROM track_genres
         UNION ALL
         SELECT track_id, NULL, subgenre_id, NULL FROM track_subgenres
         UNION ALL
         SELECT track_id, NULL, NULL, mood_id FROM track_moods`
      )
      .all() as { track_id: number; genre_id: number | null; subgenre_id: number | null; mood_id: number | null }[]
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

  ipcMain.handle('tags:exportData', async (): Promise<{ path: string } | null> => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: 'tag-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(exportTagData(db), null, 2))
    return { path: result.filePath }
  })

  ipcMain.handle('tags:importData', async (): Promise<ImportResult | null> => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const data = JSON.parse(readFileSync(result.filePaths[0], 'utf-8')) as TagExportData
    return importTagData(db, data)
  })
}
