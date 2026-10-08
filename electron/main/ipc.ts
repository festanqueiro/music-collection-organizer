import { app, ipcMain, dialog, shell, BrowserWindow, powerSaveBlocker, type IpcMainInvokeEvent } from 'electron'
import { basename, join, relative, isAbsolute } from 'node:path'
import { writeFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { applyMoves, planMove, type MovedTrack } from './moveTracks'
import { showOpenDialog, showSaveDialog } from './ipcDialogs'
import { registerTagIpc } from './ipcTags'
import { registerPlaylistIpc } from './ipcPlaylists'
import { registerConvertIpc } from './ipcConvert'
import { listScreenDisplays, watchScreenDisplays } from './screenWindow'
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
  getHiddenColumns,
  setHiddenColumns,
  getSortState,
  setSortState,
  getAudioOutputDeviceId,
  setAudioOutputDeviceId,
  getCueOutputDeviceId,
  setCueOutputDeviceId,
  getAutoCheckUpdates,
  setAutoCheckUpdates,
  getWatchCollectionFolder,
  setWatchCollectionFolder,
  getExternalBackupFolder,
  setExternalBackupFolder,
  getLastExternalBackup,
  setLastExternalBackup,
  getAutoAnalyseNewTracks,
  setAutoAnalyseNewTracks,
  setAppThemeId,
} from './config'
import { getAppTheme, isAppThemeId } from '../../src/appThemes'
import { FolderWatcher } from './folderWatcher'
import { isTrustedReleaseUrl, type Updater } from './updater'
import { getDataFolder, setDataFolder } from './bootstrap'
import { getDbFilePath } from './dbPath'
import { migrateDataFolder } from './dataMigration'
import { runScan, type ScanResult } from './scan'
import { downloadTrack } from './cloudDownload'
import { getDragIcon } from './dragIcon'
import { runAnalysisQueue } from './analysis/queue'
import { extractArtwork } from './analysis/metadata'
import { writeTags, supportsTagEditing, TagWriteError } from './tagWriter'
import { TagReader, readFileTags, saveFileTags } from './tagReader'
import { getMediaCacheDir } from './mediaCacheDir'
import { listBackups, restoreBackup, runBackup } from './backup'
import { checkDestination, runExternalBackup } from './externalBackup'
import { buildMidiExport, parseMidiExportText } from './midiExport'
import { CastController, type DirectMediaSources } from './cast/castSession'
import { isReceiverSettingsMessage } from '../../src/cast/receiverProtocol'
import { mediaUrlToFilePath, trackPathToMediaUrl } from './mediaProtocol'
import { getCastableFilePath } from './audioTranscode'
import { registerRecordingIpc } from './recording'
import { mimeTypeFor } from './mediaTypes'
import type {
  Track,
  BackupInfo,
  BackupEntry,
  EffectsSettings,
  MidiMappings,
  MidiImportResult,
  TrackTableColumnKey,
  TrackTableSortState,
  UpdateState,
  CastStatus,
  CastDirectCommand,
  EditableTags,
  WriteTagsResult,
  ExternalBackupInfo,
  ExternalBackupResult,
} from '../../src/types'

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
  first_beat: number | null
  grid_start: number | null
  musical_key: string | null
  analyzed_at: number | null
  loudness: number | null
  energy: number | null
  play_count: number
  last_played_at: number | null
  cloud_status: 'local' | 'cloud_only'
  analysis_status: 'pending' | 'analyzing' | 'done' | 'error'
  analysis_error: string | null
  tags_read_at: number | null
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
    firstBeat: row.first_beat ?? null,
    gridStart: row.grid_start ?? null,
    musicalKey: row.musical_key,
    analyzedAt: row.analyzed_at ?? null,
    loudness: row.loudness,
    energy: row.energy,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    cloudStatus: row.cloud_status,
    analysisStatus: row.analysis_status,
    analysisError: row.analysis_error ?? null,
    tagsRead: row.tags_read_at !== null,
  }
}

// How long the collection folder has to be quiet before a background
// rescan — long enough that copying in an album is one scan, not twenty.
const WATCH_DEBOUNCE_MS = 3000

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

  // The track list leaves the waveforms out (ADR 0058): 15 kB a track, read
  // by the player only, and they made every reload of the list slow.
  const trackListColumns = (db.prepare('PRAGMA table_info(tracks)').all() as { name: string }[])
    .map((c) => c.name)
    .filter((name) => name !== 'waveform_peaks')
    .join(', ')

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
  ipcMain.handle('config:getHiddenColumns', (): TrackTableColumnKey[] => getHiddenColumns())
  ipcMain.handle('config:setHiddenColumns', (_e, keys: TrackTableColumnKey[]): void =>
    setHiddenColumns(Array.isArray(keys) ? keys : [])
  )

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

  // Backup to an external disk (externalBackup.ts). One run at a time;
  // progress goes out on backup:externalProgress.
  let externalBackupController: AbortController | null = null

  async function externalBackupInfo(): Promise<ExternalBackupInfo> {
    const folder = getExternalBackupFolder()
    const collectionFolder = getCollectionFolder()
    let problem: string | null = null
    if (folder && collectionFolder) problem = await checkDestination(folder, collectionFolder)
    else if (folder) problem = 'Choose a collection folder first'
    return { folder, problem, last: getLastExternalBackup(), running: externalBackupController !== null }
  }

  ipcMain.handle('backup:getExternalInfo', (): Promise<ExternalBackupInfo> => externalBackupInfo())

  // Picks the backup folder; refuses one on the collection's own disk.
  ipcMain.handle('backup:chooseExternalFolder', async (e): Promise<{ ok: true } | { ok: false; error: string } | null> => {
    const collectionFolder = getCollectionFolder()
    if (!collectionFolder) return { ok: false, error: 'Choose a collection folder first' }
    const result = await showOpenDialog(e, {
      title: 'Choose a folder on an external disk for the backup',
      defaultPath: '/Volumes',
      properties: ['openDirectory', 'createDirectory'],
    })
    const folder = result.canceled ? null : result.filePaths[0]
    if (!folder) return null
    const problem = await checkDestination(folder, collectionFolder)
    if (problem) return { ok: false, error: problem }
    setExternalBackupFolder(folder)
    return { ok: true }
  })

  ipcMain.handle('backup:runExternal', async (): Promise<ExternalBackupResult | { error: string } | null> => {
    const folder = getExternalBackupFolder()
    const collectionFolder = getCollectionFolder()
    if (!folder || !collectionFolder) return { error: 'Choose a backup folder first' }
    if (externalBackupController) return { error: 'A backup is already running' }
    const controller = new AbortController()
    externalBackupController = controller
    try {
      const result = await runExternalBackup({
        db,
        configFilePath: getConfigFilePath(),
        collectionFolder,
        dataFolder: getDataFolder(),
        destination: folder,
        onProgress: (progress) => sendToRenderer('backup:externalProgress', progress),
        signal: controller.signal,
      })
      if (result) setLastExternalBackup(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      sendToRenderer('backup:externalProgress', { phase: 'error', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, error })
      return { error }
    } finally {
      externalBackupController = null
    }
  })

  ipcMain.handle('backup:cancelExternal', (): void => externalBackupController?.abort())

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
    syncFolderWatcher()
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
  // Background rescans for the folder watcher. runScan is synchronous, so
  // this can't overlap a manual scan:run; it just skips a round if one is
  // somehow marked in progress (the next change schedules another).
  // Reads files' own tags in the background (see tagReader.ts) — at
  // startup, and after every scan picks up new or changed files.
  const tagReader = new TagReader(db, (progress) => sendToRenderer('tags:progress', progress))
  tagReader.run()

  const folderWatcher = new FolderWatcher({
    debounceMs: WATCH_DEBOUNCE_MS,
    onChange: () => {
      const folder = getCollectionFolder()
      if (!folder || scanInProgress) return
      try {
        const result = runScan(db, folder)
        if (result.inserted || result.updated || result.missing) sendToRenderer('library:changed', result)
        if (result.inserted || result.updated) tagReader.run()
      } catch (err) {
        console.error('background scan failed', err)
      }
    },
  })

  function syncFolderWatcher(): void {
    const folder = getCollectionFolder()
    if (folder && getWatchCollectionFolder()) folderWatcher.start(folder)
    else folderWatcher.stop()
  }
  syncFolderWatcher()

  ipcMain.handle('config:setAppTheme', (_e, id: unknown): void => {
    if (!isAppThemeId(id)) return
    setAppThemeId(id)
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(getAppTheme(id).background)
  })

  ipcMain.handle('config:getLibrarySettings', (): { watchCollectionFolder: boolean; autoAnalyseNewTracks: boolean } => ({
    watchCollectionFolder: getWatchCollectionFolder(),
    autoAnalyseNewTracks: getAutoAnalyseNewTracks(),
  }))
  ipcMain.handle('config:setWatchCollectionFolder', (_e, enabled: boolean): void => {
    setWatchCollectionFolder(enabled === true)
    syncFolderWatcher()
  })
  ipcMain.handle('config:setAutoAnalyseNewTracks', (_e, enabled: boolean): void =>
    setAutoAnalyseNewTracks(enabled === true)
  )

  ipcMain.handle('scan:run', async (_e, opts?: { removeMissing?: boolean }): Promise<ScanResult> => {
    if (scanInProgress) throw new Error('A scan is already in progress')
    scanInProgress = true
    try {
      const folder = getCollectionFolder()
      if (!folder) throw new Error('No collection folder configured')
      const result = runScan(db, folder, { removeMissing: opts?.removeMissing === true })
      tagReader.run()
      return result
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
    // Tracks picked to analyse are downloaded first if they're only in the
    // cloud, one at a time (a failed one is skipped). The whole-collection
    // run below doesn't, so it never pulls down a whole cloud library.
    if (trackIds && trackIds.length > 0) {
      const cloudOnly = db
        .prepare(`SELECT id FROM tracks WHERE cloud_status = 'cloud_only' AND id IN (${trackIds.map(() => '?').join(',')})`)
        .all(...trackIds) as { id: number }[]
      for (const { id } of cloudOnly) {
        try {
          await downloadTrack(db, id)
        } catch (err) {
          console.error('download before analysis failed', id, err)
        }
      }
    }
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
    return (db.prepare(`SELECT ${trackListColumns} FROM tracks WHERE present = 1`).all() as unknown as TrackRow[]).map(rowToTrack)
  })

  // One track's whole-track waveform, for the player (ADR 0058).
  ipcMain.handle('tracks:getWaveform', (_e, trackId: number): number[] | null => {
    const row = db.prepare('SELECT waveform_peaks FROM tracks WHERE id = ?').get(trackId) as { waveform_peaks: string | null } | undefined
    return row?.waveform_peaks ? JSON.parse(row.waveform_peaks) : null
  })

  // The hidden ones, for the Missing Tracks filter: files the last scan
  // couldn't find. Marked missing so the table can say so.
  ipcMain.handle('tracks:getMissing', (): Track[] =>
    (db.prepare(`SELECT ${trackListColumns} FROM tracks WHERE present = 0`).all() as unknown as TrackRow[]).map((row) => ({
      ...rowToTrack(row),
      missing: true,
    }))
  )

  registerTagIpc(db)
  registerPlaylistIpc(db)
  registerConvertIpc(db, sendToRenderer)



  ipcMain.handle('tracks:download', async (_e, trackId: number): Promise<void> => {
    await downloadTrack(db, trackId)
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

  // Moves tracks' files into another folder of the collection (rows
  // dropped on a folder in the Folders view), after asking. Tracks already
  // there are left alone, and so are ones whose file name is taken there.
  ipcMain.handle(
    'tracks:moveToFolder',
    async (
      event,
      trackIds: number[],
      destination: string
    ): Promise<{ cancelled: boolean; moved: MovedTrack[]; failed: number; alreadyThere: number; conflicts: number }> => {
      const none = { cancelled: false, moved: [], failed: 0, alreadyThere: 0, conflicts: 0 }
      // Only into a folder of the collection that still exists.
      const collection = getCollectionFolder()
      const inside = collection ? relative(collection, destination) : '..'
      if (inside.startsWith('..') || isAbsolute(inside) || !existsSync(destination) || trackIds.length === 0) return none
      const placeholders = trackIds.map(() => '?').join(',')
      const rows = db
        .prepare(`SELECT id, path FROM tracks WHERE present = 1 AND id IN (${placeholders})`)
        .all(...trackIds) as { id: number; path: string }[]
      const plan = planMove(rows, destination, existsSync)
      const counts = { alreadyThere: plan.alreadyThere.length, conflicts: plan.conflicts.length }
      if (plan.moves.length === 0) return { ...none, ...counts }

      const count = plan.moves.length
      const window = BrowserWindow.fromWebContents(event.sender)
      const options = {
        type: 'question' as const,
        buttons: ['Move', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        message: count === 1 ? 'Do you want to move this song to this folder?' : `Do you want to move these ${count} songs to this folder?`,
        detail: [
          `${count === 1 ? basename(plan.moves[0].from) : `${count} files`} → ${basename(destination)}`,
          counts.conflicts > 0 ? `${counts.conflicts} with a file of the same name already there will be left where ${counts.conflicts === 1 ? 'it is' : 'they are'}.` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      }
      const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
      if (response !== 0) return { ...none, ...counts, cancelled: true }
      const result = await applyMoves(db, plan)
      for (const failure of result.failed) console.error('moving a track failed', failure.path, failure.error)
      return { cancelled: false, moved: result.moved, failed: result.failed.length, ...counts }
    }
  )

  // Reveals the track's file in Finder (highlighted, folder already open)
  // — same as macOS's own "Show in Finder". A cloud-only placeholder has
  // no local file to reveal.
  ipcMain.on('tracks:showInFolder', (_event, trackId: number) => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId) as { path: string } | undefined
    if (!row) return
    shell.showItemInFolder(row.path)
  })


  // Moves the file to the Trash (recoverable — and on a synced folder,
  // the cloud's own trash too), then hides its row like any file that's
  // gone missing: the row and its tags are kept, so restoring the file
  // brings the track back as it was on the next scan.
  ipcMain.handle('tracks:trash', async (_e, trackId: number): Promise<{ ok: true } | { ok: false; error: string }> => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId) as { path: string } | undefined
    if (!row) return { ok: false, error: 'That track is no longer in the collection' }
    try {
      await shell.trashItem(row.path)
    } catch (err) {
      console.error('moving to the Trash failed', row.path, err)
      return { ok: false, error: "Couldn't move the file to the Trash" }
    }
    db.prepare('UPDATE tracks SET present = 0 WHERE id = ?').run(trackId)
    return { ok: true }
  })

  // On-demand cover art for the detail panel — see extractArtwork's own
  // comment for why this isn't bulk-loaded with the rest of getTracks().
  // The start of the tune (bar 0 of the beat grid), or null to clear it;
  // returns the track as it is now, for the renderer to patch in.
  ipcMain.handle('tracks:setGridStart', (_e, trackId: number, start: number | null): Track | null => {
    const value = typeof start === 'number' && Number.isFinite(start) ? Math.max(0, Math.round(start * 1000) / 1000) : null
    db.prepare('UPDATE tracks SET grid_start = ? WHERE id = ?').run(value, trackId)
    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as unknown as TrackRow | undefined
    return row ? rowToTrack(row) : null
  })

  // One play of a track: bumps its count and returns the new totals, for
  // the renderer to patch into its copy of the track.
  ipcMain.handle('tracks:recordPlay', (_e, trackId: number): { playCount: number; lastPlayedAt: number } | null => {
    const now = Date.now()
    db.prepare('UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?').run(now, trackId)
    const row = db.prepare('SELECT play_count FROM tracks WHERE id = ?').get(trackId) as { play_count: number } | undefined
    return row ? { playCount: row.play_count, lastPlayedAt: now } : null
  })

  // Edits the file's own tags, then mirrors them (and the file's new size/
  // mtime, so the next scan doesn't take it for a changed file needing
  // re-analysis) into the DB. Errors come back as a message to show, not a
  // rejection, so the renderer gets the plain text.
  ipcMain.handle('tracks:writeTags', async (_e, trackId: number, tags: EditableTags): Promise<WriteTagsResult> => {
    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as unknown as TrackRow | undefined
    if (!row) return { ok: false, error: 'That track is no longer in the collection' }
    if (row.cloud_status === 'cloud_only') return { ok: false, error: 'Download the track first — it is only in the cloud' }
    if (!supportsTagEditing(row.format)) {
      return { ok: false, error: `Editing tags in ${row.format.toUpperCase()} files isn't supported yet` }
    }
    const clean = (value: string | null) => (value?.trim() ? value.trim() : null)
    const next: EditableTags = {
      title: clean(tags.title),
      artist: clean(tags.artist),
      album: clean(tags.album),
      genre: clean(tags.genre),
      year: tags.year && Number.isInteger(tags.year) && tags.year > 0 ? tags.year : null,
    }
    try {
      await writeTags(row.path, row.format, next, getMediaCacheDir())
    } catch (err) {
      console.error('writing tags failed', row.path, err)
      return { ok: false, error: err instanceof TagWriteError ? err.message : "Couldn't write to the file" }
    }
    const stats = statSync(row.path)
    db.prepare(
      'UPDATE tracks SET title = ?, artist = ?, album = ?, genre_tag = ?, year = ?, size = ?, mtime = ?, tags_read_at = ? WHERE id = ?'
    ).run(next.title, next.artist, next.album, next.genre, next.year, stats.size, Math.floor(stats.mtimeMs), Date.now(), trackId)
    const updated = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as unknown as TrackRow
    return { ok: true, track: rowToTrack(updated) }
  })

  // The file's current tags, read now and saved to the row — the detail
  // panel asks for this when a track is selected, so what it shows (and
  // what the tag editor starts from) is what's really in the file, even
  // before the background read gets to it.
  ipcMain.handle('tracks:readFileTags', async (_e, trackId: number): Promise<Track | null> => {
    const row = db.prepare('SELECT id, path, cloud_status FROM tracks WHERE id = ?').get(trackId) as
      | { id: number; path: string; cloud_status: string }
      | undefined
    if (!row || row.cloud_status === 'cloud_only') return null
    try {
      saveFileTags(db, trackId, await readFileTags(row.path))
    } catch (err) {
      console.error('reading tags failed', row.path, err)
      return null
    }
    return rowToTrack(db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as unknown as TrackRow)
  })

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


  // Casting to a Google Cast device (see electron/main/cast/). Chunks are
  // `send`, not `invoke` — the renderer streams several a second and
  // doesn't need a reply per chunk.
  // Direct mode serves track files to the device: looked up by id from
  // the DB, and only if they're inside the collection folder (the same
  // check the media:// protocol makes).
  function castableTrackPath(trackId: number): string | null {
    const row = db.prepare('SELECT path, cloud_status FROM tracks WHERE id = ?').get(trackId) as
      | { path: string; cloud_status: string }
      | undefined
    if (!row || row.cloud_status === 'cloud_only') return null
    return mediaUrlToFilePath(trackPathToMediaUrl(row.path), getCollectionFolder())
  }
  // The device asks for the artwork right after MCO checks it exists, so
  // keep the last one rather than extracting it twice.
  let lastArtwork: { trackId: number; image: { data: Buffer; contentType: string } | null } | null = null
  const castSources: DirectMediaSources = {
    track: async (trackId) => {
      const filePath = castableTrackPath(trackId)
      if (!filePath) {
        if (process.env.MCO_CAST_DEBUG) console.log('[cast] track', trackId, 'not servable (not in the DB, cloud-only, or outside the collection folder)')
        return null
      }
      // Cast devices can't play AIFF, and can't seek in FLAC without a seek
      // table — see getCastableFilePath.
      const playable = await getCastableFilePath(filePath, getMediaCacheDir())
      return { filePath: playable, contentType: mimeTypeFor(playable) }
    },
    artwork: async (trackId) => {
      if (lastArtwork?.trackId === trackId) return lastArtwork.image
      const filePath = castableTrackPath(trackId)
      let image: { data: Buffer; contentType: string } | null = null
      if (filePath) {
        const dataUrl = await extractArtwork(filePath).catch(() => null)
        const match = dataUrl?.match(/^data:([^;]+);base64,(.*)$/)
        if (match) image = { contentType: match[1], data: Buffer.from(match[2], 'base64') }
      }
      lastArtwork = { trackId, image }
      return image
    },
    describe: (trackId) => {
      const row = db.prepare('SELECT filename, title, artist, album FROM tracks WHERE id = ?').get(trackId) as
        | { filename: string; title: string | null; artist: string | null; album: string | null }
        | undefined
      return row ? { title: row.title ?? row.filename, artist: row.artist, album: row.album } : null
    },
  }
  // While casting, keep the Mac from going to sleep: the device streams
  // each track from this Mac (CastMediaServer) and MCO drives it, so a
  // sleeping Mac leaves the TV hanging. The display can still sleep. Ends
  // with the session.
  let castSleepBlocker: number | null = null
  function keepAwakeWhileCasting(status: CastStatus): void {
    const active = status.state === 'connecting' || status.state === 'casting'
    if (active && castSleepBlocker === null) {
      castSleepBlocker = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!active && castSleepBlocker !== null) {
      powerSaveBlocker.stop(castSleepBlocker)
      castSleepBlocker = null
    }
  }

  const cast = new CastController(
    (devices) => sendToRenderer('cast:devices', devices),
    (status) => {
      keepAwakeWhileCasting(status)
      sendToRenderer('cast:status', status)
    },
    (event) => sendToRenderer('cast:media', event),
    castSources,
  )
  // Casting ends with MCO. On quit, hold the quit briefly so the TV is
  // actually told to stop (back to its home screen) rather than left on a
  // stream that's about to disappear. Closing the window (macOS keeps the
  // app running) or the interface crashing stops it too — nothing would
  // be feeding the stream any more.
  let quittingAfterCastStop = false
  app.on('before-quit', (event) => {
    if (quittingAfterCastStop || !cast.isActive()) {
      cast.dispose()
      return
    }
    event.preventDefault()
    quittingAfterCastStop = true
    cast.shutdown(1500).finally(() => app.quit())
  })
  app.on('browser-window-created', (_e, win) => {
    win.on('closed', () => cast.stop())
    win.webContents.on('render-process-gone', () => cast.stop())
  })
  ipcMain.handle('cast:startDiscovery', (): void => cast.startDiscovery())
  ipcMain.handle('cast:stopDiscovery', (): void => cast.stopDiscovery())
  ipcMain.handle('cast:getStatus', (): CastStatus => cast.getStatus())
  ipcMain.handle('cast:start', (_e, deviceId: string): Promise<void> => cast.start(String(deviceId)))
  ipcMain.on('cast:receiver', (_e, message: unknown) => {
    if (isReceiverSettingsMessage(message)) cast.sendReceiverSettings(message)
  })
  ipcMain.on('cast:direct', (_e, command: CastDirectCommand) => {
    if (command && typeof command === 'object' && typeof command.type === 'string') cast.runDirect(command)
  })
  ipcMain.handle('cast:stop', (): void => cast.stop())

  registerRecordingIpc(sendToRenderer)

  // Displays the second screen can show on, and their changes (an Apple
  // TV joining as an AirPlay display, a projector unplugged).
  ipcMain.handle('screen:getDisplays', () => listScreenDisplays(getMainWindow()))
  watchScreenDisplays(() => sendToRenderer('screen:displays', listScreenDisplays(getMainWindow())))

  // While the full-screen visualiser is open, keep the Mac and its display
  // awake — it's something to watch, not to interact with, so the idle
  // timer would otherwise dim and sleep the screen mid-song.
  let visualizerSleepBlocker: number | null = null
  ipcMain.handle('power:keepDisplayAwake', (_e: IpcMainInvokeEvent, awake: boolean): void => {
    if (awake && visualizerSleepBlocker === null) {
      visualizerSleepBlocker = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!awake && visualizerSleepBlocker !== null) {
      powerSaveBlocker.stop(visualizerSleepBlocker)
      visualizerSleepBlocker = null
    }
  })
}
