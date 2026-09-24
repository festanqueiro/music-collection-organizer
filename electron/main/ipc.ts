import { app, ipcMain, dialog, shell, BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { join } from 'node:path'
import { writeFileSync, readFileSync } from 'node:fs'
import type { AppDatabase } from './db'
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  setLastBackupAt,
  getLastBackupError,
  getConfigFilePath,
  getEffectsSettings,
  setEffectsSettings,
  getMidiMappings,
  setMidiMappings,
  getColumnOrder,
  setColumnOrder,
  getSortState,
  setSortState,
  getAudioOutputDeviceId,
  setAudioOutputDeviceId,
  getCueOutputDeviceId,
  setCueOutputDeviceId,
  getAutoCheckUpdates,
  setAutoCheckUpdates,
} from './config'
import { isTrustedReleaseUrl, type Updater } from './updater'
import { getDataFolder, setDataFolder } from './bootstrap'
import { getDbFilePath } from './dbPath'
import { migrateDataFolder } from './dataMigration'
import { runScan, type ScanResult } from './scan'
import { downloadTrack } from './cloudDownload'
import { getDragIcon } from './dragIcon'
import { runAnalysisQueue } from './analysis/queue'
import { extractArtwork } from './analysis/metadata'
import { getMediaCacheDir } from './mediaCacheDir'
import { listBackups, restoreBackup, runBackup } from './backup'
import {
  createGenre,
  createSubgenre,
  deleteGenre,
  deleteSubgenre,
  renameGenre,
  renameSubgenre,
  setGenreColor,
  countTracksWithGenre,
  countTracksWithSubgenre,
  setTrackGenres,
  setTrackSubgenres,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  captureGenreDeletionSnapshot,
  undoGenreDeletion,
  captureSubgenreDeletionSnapshot,
  undoSubgenreDeletion,
} from './tags'
import { exportTagData, importTagData, type TagExportData } from './tagExport'
import { buildMidiExport, parseMidiExportText } from './midiExport'
import { buildRekordboxXml } from './rekordboxExport'
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
  MidiImportResult,
  TrackTableColumnKey,
  TrackTableSortState,
  UpdateState,
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
  birthtime: number | null
  duration: number | null
  bitrate: number | null
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
  color: string | null
}

interface SubgenreRow {
  id: number
  name: string
  genre_id: number
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
    birthtime: row.birthtime,
    duration: row.duration,
    bitrate: row.bitrate,
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

// Dialogs are parented to whichever window asked for them. Falls back to an
// unparented dialog if that window is somehow gone by now.
function showOpenDialog(e: IpcMainInvokeEvent, options: OpenDialogOptions) {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

function showSaveDialog(e: IpcMainInvokeEvent, options: SaveDialogOptions) {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}

// getMainWindow is a function (not a fixed BrowserWindow) so a window
// recreated after all windows were closed (macOS's 'activate' event) is
// always the one events target — a captured reference to the original
// window would be a destroyed BrowserWindow after that point. It returns
// null while no window is open (macOS keeps the app running after the
// last window closes), so every send goes through sendToRenderer.
export function registerIpcHandlers(
  db: AppDatabase,
  getMainWindow: () => BrowserWindow | null,
  backupFolder: string,
  updater: Updater
) {
  function sendToRenderer(channel: string, payload: unknown): void {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  // Guards scan:run against overlapping runs.
  let scanInProgress = false
  // Every in-flight analysis:run call's controller — a Set, not a single
  // slot, since multiple calls can legitimately run concurrently (e.g. a
  // full-collection "Analyse Collection" run plus a single-track one
  // triggered by loading a track into the player). analysis:stop aborts
  // all of them.
  const activeAnalysisControllers = new Set<AbortController>()
  // Progress summed across every in-flight analysis:run call. They all
  // report on the one scan:progress channel, and the renderer treats
  // done === total as "finished" and hides the bar — so per-run numbers
  // let a single-track background run completing hide (and overwrite) a
  // bulk run's progress. Reset once the last run finishes.
  const analysisProgress = { done: 0, total: 0 }
  function sendAnalysisProgress(): void {
    sendToRenderer('scan:progress', { ...analysisProgress })
  }

  ipcMain.handle('config:getCollectionFolder', (): string | null => getCollectionFolder())

  // Lets the renderer warn before opening the folder picker below — a
  // first-ever collection folder pick also relocates the DB + settings
  // and relaunches the app (see config:chooseCollectionFolder), which
  // would otherwise happen with zero warning and look like a crash.
  ipcMain.handle('config:willRelocateOnNextCollectionFolderPick', (): boolean => getDataFolder() === null)

  ipcMain.handle('app:getVersion', (): string => app.getVersion())

  ipcMain.handle('config:getEffectsSettings', (): EffectsSettings => getEffectsSettings())
  ipcMain.handle('config:setEffectsSettings', (_e, settings: EffectsSettings): void =>
    setEffectsSettings(settings)
  )

  ipcMain.handle('config:getMidiMappings', (): MidiMappings => getMidiMappings())
  ipcMain.handle('config:setMidiMappings', (_e, mappings: MidiMappings): void => setMidiMappings(mappings))

  ipcMain.handle('midi:exportMappings', async (e): Promise<{ path: string } | null> => {
    const result = await showSaveDialog(e, {
      defaultPath: 'mco-midi-mappings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(buildMidiExport(getMidiMappings()), null, 2))
    return { path: result.filePath }
  })

  // Only reads and validates — the renderer applies the result (after
  // confirming, if it would replace existing bindings).
  ipcMain.handle('midi:readMappingsFile', async (e): Promise<MidiImportResult | null> => {
    const result = await showOpenDialog(e, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return parseMidiExportText(readFileSync(result.filePaths[0], 'utf-8'))
  })

  ipcMain.handle('config:getColumnOrder', (): TrackTableColumnKey[] => getColumnOrder())
  ipcMain.handle('config:setColumnOrder', (_e, order: TrackTableColumnKey[]): void => setColumnOrder(order))

  ipcMain.handle('config:getSortState', (): TrackTableSortState => getSortState())
  ipcMain.handle('config:setSortState', (_e, state: TrackTableSortState): void => setSortState(state))

  ipcMain.handle('config:getAudioOutputDeviceId', (): string | null => getAudioOutputDeviceId())
  ipcMain.handle('config:setAudioOutputDeviceId', (_e, deviceId: string | null): void =>
    setAudioOutputDeviceId(deviceId)
  )

  ipcMain.handle('updates:getState', (): UpdateState => updater.getState())
  ipcMain.handle('updates:check', (): Promise<UpdateState> => updater.check())
  ipcMain.handle('updates:install', (): Promise<void> => updater.install())
  // Opens the release page main already knows about — the renderer can't
  // pass a URL of its own.
  ipcMain.handle('updates:openReleasePage', async (): Promise<void> => {
    const url =
      updater.getReleasePageUrl() ?? 'https://github.com/festanqueiro/music-collection-organizer/releases/latest'
    if (isTrustedReleaseUrl(url)) await shell.openExternal(url)
  })
  ipcMain.handle('config:getAutoCheckUpdates', (): boolean => getAutoCheckUpdates())
  ipcMain.handle('config:setAutoCheckUpdates', (_e, enabled: boolean): void => setAutoCheckUpdates(enabled === true))

  ipcMain.handle('config:getCueOutputDeviceId', (): string | null => getCueOutputDeviceId())
  ipcMain.handle('config:setCueOutputDeviceId', (_e, deviceId: string | null): void =>
    setCueOutputDeviceId(deviceId)
  )

  ipcMain.handle('backup:getInfo', (): BackupInfo => ({
    backupFolder,
    lastBackupAt: getLastBackupAt(),
    lastBackupError: getLastBackupError(),
  }))

  ipcMain.handle('backup:list', (): BackupEntry[] => listBackups(backupFolder))

  // On-demand backup ("Back up now" in Settings) — the same VACUUM INTO
  // snapshot as the automatic daily one, just triggered immediately rather
  // than waiting for the daily check. Doesn't touch lastBackupAt, so it
  // never suppresses (or gets suppressed by) the automatic one.
  ipcMain.handle('backup:runNow', (): BackupEntry => {
    const now = new Date()
    const { dbBackupPath, configBackupPath } = runBackup(db, getConfigFilePath(), backupFolder, now)
    setLastBackupAt(now.toISOString())
    const entry = listBackups(backupFolder).find((e) => e.dbPath === dbBackupPath)
    if (entry) return entry
    // Fallback in case listBackups' filename parsing ever drifts from
    // runBackup's own naming — still returns a usable entry rather than
    // throwing right after a successful backup.
    return {
      timestamp: dbBackupPath.replace(/^.*collection-(.+)\.db$/, '$1'),
      dbPath: dbBackupPath,
      configPath: configBackupPath,
    }
  })

  ipcMain.handle('backup:restore', (_e, timestamp: string): void => {
    const entry = listBackups(backupFolder).find((e) => e.timestamp === timestamp)
    if (!entry) throw new Error(`No backup found for timestamp ${timestamp}`)
    db.close()
    // Resolves through the same helper as the startup openDatabase() call
    // and config:chooseDbLocation below, so a restore always lands
    // wherever the DB is currently configured to live, not always userData
    // — otherwise relocating the DB and then restoring a backup would
    // silently resurrect a stale collection.db at the old default location.
    restoreBackup(entry, getDbFilePath(), getConfigFilePath())
    app.relaunch()
    app.exit()
  })

  // Closes the live DB, hands off to dataMigration.ts's pure copy-or-adopt
  // logic, persists the new location, then relaunches — same close/
  // relaunch shape as backup:restore above, so a fresh openDatabase()/
  // config getStore() at startup opens the new location cleanly instead
  // of trying to hot-swap the live db handle (and the config.ts
  // module-level Store singleton) every other handler in this file has
  // already closed over.
  function relocateDataFolder(newDataFolder: string, collectionFolderToStamp: string | undefined): void {
    db.close()
    migrateDataFolder({
      newDataFolder,
      oldDbPath: getDbFilePath(),
      oldConfigPath: getConfigFilePath(),
      collectionFolderToStamp,
    })
    setDataFolder(newDataFolder)
    app.relaunch()
    app.exit()
  }

  ipcMain.handle('config:chooseCollectionFolder', async (e): Promise<string | null> => {
    const result = await showOpenDialog(e, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]

    // Only a *first-ever* pick (no data folder configured yet — a fresh
    // install) also establishes where the DB + settings live by default:
    // right inside the chosen collection folder (in a hidden `.mco`
    // subfolder, out of the way of the actual music), so the whole
    // collection travels together if the folder is ever copied or moved
    // to another machine or drive. Re-picking a *different* collection
    // folder later (this app supports switching between them) does NOT
    // relocate again, on purpose — the DB stays wherever it already is,
    // so switching folders keeps today's scan/analyze-prompt flow instead
    // of always relaunching. config:chooseDbLocation below is the
    // explicit, deliberate way to move the data folder after the fact.
    if (getDataFolder() === null) {
      relocateDataFolder(join(folder, '.mco'), folder)
      return folder // unreachable in practice — relocateDataFolder relaunches the app
    }

    setCollectionFolder(folder)
    return folder
  })

  ipcMain.handle('config:getDbFilePath', (): string => getDbFilePath())

  // Explicit, deliberate relocation of the data folder (DB + settings) to
  // wherever the user picks — independent of the automatic first-pick
  // default above. See dataMigration.ts's migrateDataFolder for the
  // copy-vs-adopt and never-delete behavior.
  ipcMain.handle('config:chooseDbLocation', async (e): Promise<string | null> => {
    const result = await showOpenDialog(e, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    relocateDataFolder(folder, undefined)
    return folder // unreachable in practice — migrateDataFolder relaunches the app
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

    // Runs alongside any other in-flight analysis:run call rather than
    // rejecting — e.g. loading a track into the player kicks off a
    // single-track analysis in the background, which must not be blocked
    // just because a full-collection "Analyse Collection" run happens to
    // already be going. Each call gets its own controller so
    // analysis:stop can abort all of them together.
    const controller = new AbortController()
    activeAnalysisControllers.add(controller)
    // onProgress only fires once a track *finishes* — for a single-track
    // background analysis (e.g. auto-triggered by loading it into the
    // player) that can be the only tick there ever is, so the renderer
    // never sees the 'analyzing' status in between and never shows the
    // spinner. This tick fires immediately, right after the DB rows above
    // flip to 'analyzing' inside runAnalysisQueue's dispatch, so the
    // renderer refreshes and picks that up before the track (possibly)
    // finishes fast enough to skip the visible window entirely.
    analysisProgress.total += tracks.length
    sendAnalysisProgress()
    let runDone = 0
    try {
      await runAnalysisQueue(db, tracks, {
        concurrency: 4,
        cacheDir: getMediaCacheDir(),
        onProgress: (progress) => {
          analysisProgress.done += progress.done - runDone
          runDone = progress.done
          sendAnalysisProgress()
        },
        signal: controller.signal,
      })
    } finally {
      activeAnalysisControllers.delete(controller)
      // A stopped/failed run never reaches its own total — count its
      // remainder as finished so the aggregate can still complete.
      analysisProgress.done += tracks.length - runDone
      if (activeAnalysisControllers.size === 0) {
        analysisProgress.done = analysisProgress.total
        sendAnalysisProgress()
        analysisProgress.done = 0
        analysisProgress.total = 0
      } else {
        sendAnalysisProgress()
      }
    }
  })

  ipcMain.handle('analysis:stop', (): void => {
    for (const controller of activeAnalysisControllers) controller.abort()
  })

  ipcMain.handle('tracks:getAll', (): Track[] => {
    // present = 0 tracks are ones runScan couldn't find on disk in the most
    // recent scan (moved, temporarily unmounted, or the collection folder
    // changed) — hidden here, but never deleted, so their tags survive.
    return (db.prepare('SELECT * FROM tracks WHERE present = 1').all() as unknown as TrackRow[]).map(rowToTrack)
  })

  // COLLATE NOCASE so the Tag Tree/pickers/selects (everything reads
  // through these two handlers) list tags A-Z regardless of case, rather
  // than in whatever order they happened to get created.
  ipcMain.handle('tags:getGenres', (): Genre[] =>
    (db.prepare('SELECT * FROM genres ORDER BY name COLLATE NOCASE').all() as unknown as GenreRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    }))
  )
  ipcMain.handle('tags:getSubgenres', (): Subgenre[] =>
    (db.prepare('SELECT * FROM subgenres ORDER BY name COLLATE NOCASE').all() as unknown as SubgenreRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      genreId: r.genre_id,
    }))
  )

  ipcMain.handle('tags:createGenre', (_e, name: string): number => createGenre(db, name))
  ipcMain.handle('tags:createSubgenre', (_e, name: string, genreId: number): number =>
    createSubgenre(db, name, genreId)
  )
  ipcMain.handle('tags:renameGenre', (_e, genreId: number, name: string): void => renameGenre(db, genreId, name))
  ipcMain.handle('tags:renameSubgenre', (_e, subgenreId: number, name: string): void =>
    renameSubgenre(db, subgenreId, name)
  )
  ipcMain.handle('tags:setGenreColor', (_e, genreId: number, color: string | null): void =>
    setGenreColor(db, genreId, color)
  )
  ipcMain.handle('tags:countTracksWithGenre', (_e, genreId: number): number => countTracksWithGenre(db, genreId))
  ipcMain.handle('tags:countTracksWithSubgenre', (_e, subgenreId: number): number =>
    countTracksWithSubgenre(db, subgenreId)
  )
  ipcMain.handle('tags:deleteGenre', (_e, genreId: number): GenreDeletionSnapshot => {
    const snapshot = captureGenreDeletionSnapshot(db, genreId)
    deleteGenre(db, genreId)
    return snapshot
  })
  ipcMain.handle('tags:undoDeleteGenre', (_e, snapshot: GenreDeletionSnapshot): void =>
    undoGenreDeletion(db, snapshot)
  )
  ipcMain.handle('tags:deleteSubgenre', (_e, subgenreId: number): SubgenreDeletionSnapshot => {
    const snapshot = captureSubgenreDeletionSnapshot(db, subgenreId)
    deleteSubgenre(db, subgenreId)
    return snapshot
  })
  ipcMain.handle('tags:undoDeleteSubgenre', (_e, snapshot: SubgenreDeletionSnapshot): void =>
    undoSubgenreDeletion(db, snapshot)
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

  ipcMain.handle(
    'tags:batchAddTags',
    (_e, trackIds: number[], tagIds: { genreIds: number[]; subgenreIds: number[] }): TrackTagIds[] => {
      if (tagIds.genreIds.length) addGenresToTracks(db, trackIds, tagIds.genreIds)
      if (tagIds.subgenreIds.length) addSubgenresToTracks(db, trackIds, tagIds.subgenreIds)
      return trackIds.map((trackId) => ({ trackId, ...getTrackTagIds(db, trackId) }))
    }
  )

  ipcMain.handle('tracks:download', async (_e, trackId: number): Promise<void> => {
    await downloadTrack(db, trackId, getMediaCacheDir())
  })

  // Native OS file drag (e.g. dragging rows out to Finder, a DAW, or any
  // other app) — this hands the OS the tracks' existing on-disk paths, the
  // same as dragging files out of Finder itself. Nothing is copied or
  // moved by this app; the receiving app/Finder decides what happens next,
  // exactly like any other native file drag. `ipcMain.on` (not `handle`)
  // matches Electron's own recipe for startDrag: fire-and-forget, no
  // renderer-side await needed.
  ipcMain.on('tracks:startDrag', (event, trackIds: number[]) => {
    const placeholders = trackIds.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT path FROM tracks WHERE id IN (${placeholders})`)
      .all(...trackIds) as { path: string }[]
    if (rows.length === 0) return
    event.sender.startDrag({ file: rows[0].path, files: rows.map((r) => r.path), icon: getDragIcon() })
  })

  // Reveals the track's file in Finder (highlighted, folder already open)
  // — same as macOS's own "Show in Finder". A cloud-only placeholder has
  // no local file to reveal.
  ipcMain.on('tracks:showInFolder', (_event, trackId: number) => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId) as { path: string } | undefined
    if (!row) return
    shell.showItemInFolder(row.path)
  })

  // On-demand cover art for the detail panel — see extractArtwork's own
  // comment for why this isn't bulk-loaded with the rest of getTracks().
  ipcMain.handle('tracks:getArtwork', async (_e, trackId: number): Promise<string | null> => {
    const row = db.prepare('SELECT path, cloud_status FROM tracks WHERE id = ?').get(trackId) as
      | { path: string; cloud_status: string }
      | undefined
    if (!row || row.cloud_status === 'cloud_only') return null
    try {
      return await extractArtwork(row.path)
    } catch (err) {
      console.error('failed to extract artwork', err)
      return null
    }
  })

  ipcMain.handle('tracks:getAllTagIds', (): TrackTagIds[] => {
    const rows = db
      .prepare(
        `SELECT track_id, genre_id, NULL as subgenre_id FROM track_genres
         UNION ALL
         SELECT track_id, NULL, subgenre_id FROM track_subgenres`
      )
      .all() as { track_id: number; genre_id: number | null; subgenre_id: number | null }[]
    const byTrack = new Map<number, { genreIds: number[]; subgenreIds: number[] }>()
    for (const row of rows) {
      if (!byTrack.has(row.track_id)) byTrack.set(row.track_id, { genreIds: [], subgenreIds: [] })
      const entry = byTrack.get(row.track_id)!
      if (row.genre_id) entry.genreIds.push(row.genre_id)
      if (row.subgenre_id) entry.subgenreIds.push(row.subgenre_id)
    }
    return Array.from(byTrack.entries()).map(([trackId, tags]) => ({ trackId, ...tags }))
  })

  ipcMain.handle('tags:exportData', async (e): Promise<{ path: string } | null> => {
    const result = await showSaveDialog(e, {
      defaultPath: 'tag-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, JSON.stringify(exportTagData(db), null, 2))
    return { path: result.filePath }
  })

  // One-way export for Rekordbox's "rekordbox xml" library view — see
  // rekordboxExport.ts for what goes in it.
  ipcMain.handle(
    'export:rekordbox',
    async (e): Promise<{ path: string; trackCount: number; playlistCount: number } | null> => {
      const result = await showSaveDialog(e, {
        defaultPath: 'mco-rekordbox.xml',
        filters: [{ name: 'Rekordbox XML', extensions: ['xml'] }],
      })
      if (result.canceled || !result.filePath) return null
      const { xml, trackCount, playlistCount } = buildRekordboxXml(db, app.getVersion())
      writeFileSync(result.filePath, xml)
      return { path: result.filePath, trackCount, playlistCount }
    }
  )

  ipcMain.handle('tags:importData', async (e): Promise<ImportResult | null> => {
    const result = await showOpenDialog(e, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const data = JSON.parse(readFileSync(result.filePaths[0], 'utf-8')) as TagExportData
    return importTagData(db, data)
  })
}
