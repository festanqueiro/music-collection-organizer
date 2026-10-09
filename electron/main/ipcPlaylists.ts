// The playlists' and hot cues' IPC (docs/features/playlists.md,
// hot-cues.md), with the Rekordbox imports and exports that belong to
// them. Registered from ipc.ts.
import { app, ipcMain, dialog, BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { basename, dirname, join } from 'node:path'
import { writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { getCollectionFolder, getPlaylistImportFolder, setPlaylistImportFolder, getRekordboxCompareFile, setRekordboxCompareFile } from './config'
import { compareWithRekordbox, loadMcoSide } from './rekordboxCompare'
import { deleteHotCue, getHotCueCounts, getTrackCues, importRekordboxCues, setHotCue, updateHotCue } from './cues'
import { getMediaCacheDir } from './mediaCacheDir'
import { waveformSection } from './waveformSection'
import {
  addTracksToPlaylist,
  createPlaylistNode,
  deletePlaylistNode,
  getNodeTrackIds,
  getPlaylistNodes,
  getPlaylistTrackIds,
  getTrackPlaylistIds,
  removeTracksFromPlaylist,
  renamePlaylistNode,
  setPlaylistTrackIds,
  trackMatcher,
  applyRekordboxImport,
  detachPlaylistNode,
  movePlaylistNode,
  planRekordboxImport,
  rekordboxTxtToTree,
  playlistToM3u,
  folderPlaylists,
  rememberPathAliases,
} from './playlists'
import {
  decodeRekordboxText,
  parseM3uEntries,
  parseRekordboxTxt,
  readRekordboxCollection,
  type RekordboxCollection,
  type RekordboxNode,
} from './rekordboxXml'
import type {
  PlaylistNode,
  RekordboxImportPlan,
  RekordboxReport,
  RekordboxDuplicateAction,
  RekordboxImportDestination,
  RekordboxImportChoices,
  RekordboxImportResult,
  TrackCue,
  WaveformSection,
} from '../../src/types'
import type { AppDatabase } from './db'
import { importRekordboxBpm } from './rekordboxBpm'

export function registerPlaylistIpc(db: AppDatabase): void {
  // Playlists (docs/features/playlists.md): changes return the tree after
  // the write, so the store patches locally.
  ipcMain.handle('playlists:getNodes', (): PlaylistNode[] => getPlaylistNodes(db))
  ipcMain.handle(
    'playlists:create',
    (_e, kind: 'folder' | 'playlist', name: string, parentId: number | null): { id: number; nodes: PlaylistNode[] } => {
      const id = createPlaylistNode(db, kind, name, parentId)
      return { id, nodes: getPlaylistNodes(db) }
    }
  )
  ipcMain.handle('playlists:rename', (_e, id: number, name: string): PlaylistNode[] => {
    renamePlaylistNode(db, id, name)
    return getPlaylistNodes(db)
  })
  ipcMain.handle('playlists:delete', (_e, id: number): PlaylistNode[] => {
    deletePlaylistNode(db, id)
    return getPlaylistNodes(db)
  })
  // Rekordbox: the whole collection's XML export (File menu), or single
  // playlists exported as .m3u8 (paths) or .txt (titles) — several at once.
  // A collection export is a few megabytes of XML, and an import asks for
  // it several times (the plan, the counts, then the import itself): read
  // and parsed once per file, until the file changes.
  const collections = new Map<string, { mtimeMs: number; size: number; collection: RekordboxCollection }>()
  const loadCollection = (filePath: string): RekordboxCollection => {
    const stats = statSync(filePath)
    const cached = collections.get(filePath)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.collection
    const collection = readRekordboxCollection(decodeRekordboxText(readFileSync(filePath)))
    // One export at a time is all that's worth keeping.
    collections.clear()
    collections.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, collection })
    return collection
  }
  const readRekordboxFiles = (filePaths: string[]): RekordboxNode[] =>
    filePaths.flatMap((filePath): RekordboxNode[] => {
      if (/\.xml$/i.test(filePath)) return loadCollection(filePath).tree
      const text = decodeRekordboxText(readFileSync(filePath))
      const name = basename(filePath).replace(/\.[^.]+$/, '')
      if (/\.m3u8?$/i.test(filePath)) {
        const entries = parseM3uEntries(text)
        return [{ kind: 'playlist', name, paths: entries.map((e) => e.path), hints: entries.map((e) => e.hint) }]
      }
      return rekordboxTxtToTree(db, name, parseRekordboxTxt(text))
    })
  // The collection exports (xml) among the picked files, with their tracks' cues and tempos.
  const readRekordboxCollections = (filePaths: string[]): RekordboxCollection[] =>
    filePaths.filter((filePath) => /\.xml$/i.test(filePath)).map(loadCollection)
  ipcMain.handle(
    'playlists:pickRekordbox',
    async (event): Promise<{ filePaths: string[]; plan: RekordboxImportPlan } | { error: string } | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: 'Import from Rekordbox',
        // Opens where the last import came from (Rekordbox's exports
        // usually go to the same folder).
        defaultPath: getPlaylistImportFolder() ?? undefined,
        properties: ['openFile' as const, 'multiSelections' as const],
        filters: [{ name: 'Rekordbox export', extensions: ['m3u8', 'm3u', 'txt', 'xml'] }],
      }
      const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null
      setPlaylistImportFolder(dirname(result.filePaths[0]))
      try {
        const plan = planRekordboxImport(db, readRekordboxFiles(result.filePaths))
        // A collection export also holds cues and tempos: counted here, taken only if asked.
        const collections = readRekordboxCollections(result.filePaths)
        if (collections.length > 0) {
          const match = trackMatcher(db)
          const sum = { cues: { songs: 0, cues: 0, skipped: 0 }, bpm: { songs: 0 } }
          for (const collection of collections) {
            const cues = importRekordboxCues(db, collection, match, false)
            sum.cues = { songs: sum.cues.songs + cues.songs, cues: sum.cues.cues + cues.cues, skipped: sum.cues.skipped + cues.skipped }
            sum.bpm.songs += importRekordboxBpm(db, collection, match, false).songs
          }
          plan.extras = sum
        }
        return { filePaths: result.filePaths, plan }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  // Rekordbox sync, phase 1: compare Rekordbox's collection export with MCO
  // (read-only). `pick` asks for the file; otherwise the last one is used.
  ipcMain.handle(
    'rekordbox:compare',
    async (event, pick: boolean): Promise<{ report: RekordboxReport } | { error: string } | null> => {
      let file = pick ? null : getRekordboxCompareFile()
      if (!file || !existsSync(file)) {
        const window = BrowserWindow.fromWebContents(event.sender)
        const last = getRekordboxCompareFile()
        const options = {
          title: 'Compare with Rekordbox',
          message: 'Choose the collection Rekordbox exported (File → Export Collection in xml format)',
          defaultPath: last ? dirname(last) : undefined,
          properties: ['openFile' as const],
          filters: [{ name: 'Rekordbox collection (xml)', extensions: ['xml'] }],
        }
        const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        if (result.canceled || result.filePaths.length === 0) return null
        file = result.filePaths[0]
      }
      try {
        const collection = loadCollection(file)
        if (collection.tracks.length === 0) return { error: "That file has no songs — it needs Rekordbox's whole-collection export." }
        setRekordboxCompareFile(file)
        return { report: compareWithRekordbox(file, collection, loadMcoSide(db, getCollectionFolder())) }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
  // Cue points (docs/features/hot-cues.md): writes return the track's cues.
  ipcMain.handle('cues:get', (_e, trackId: number): TrackCue[] => getTrackCues(db, trackId))
  ipcMain.handle('waveform:section', async (_e, trackId: number, start: number, length: number): Promise<WaveformSection | null> => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ?').get(trackId) as { path: string } | undefined
    if (!row || !Number.isFinite(start) || !(length > 0) || length > 300) return null
    return waveformSection(row.path, getMediaCacheDir(), start, length)
  })
  ipcMain.handle('cues:counts', (): Record<number, number> => getHotCueCounts(db))
  ipcMain.handle('cues:set', (_e, trackId: number, slot: number, start: number): TrackCue[] => setHotCue(db, trackId, slot, start))
  ipcMain.handle(
    'cues:update',
    (_e, trackId: number, slot: number, changes: { color?: string | null; name?: string }): TrackCue[] =>
      updateHotCue(db, trackId, slot, changes)
  )
  ipcMain.handle('cues:delete', (_e, trackId: number, slot: number): TrackCue[] => deleteHotCue(db, trackId, slot))
  // From the Compare report: the compared export's cues, for songs with none in MCO.
  ipcMain.handle('cues:importRekordbox', (): { songs: number; cues: number; skipped: number } | { error: string } => {
    const file = getRekordboxCompareFile()
    if (!file || !existsSync(file)) return { error: 'Compare with Rekordbox first — the export file is gone.' }
    try {
      return importRekordboxCues(db, loadCollection(file), trackMatcher(db))
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
  // relinks: the "found at another path" songs the user kept ticked.
  // duplicates: per incoming playlist MCO already seemed to have, skip /
  // new / update (with the MCO playlist to update).
  // destination: where the new playlists and folders go.
  // choices: what to take — playlists, and from a collection export its
  // cues and tempos.
  ipcMain.handle(
    'playlists:importRekordbox',
    (
      _e,
      filePaths: string[],
      relinks: { from: string; trackId: number }[] = [],
      duplicates: Record<string, { action: RekordboxDuplicateAction; targetId?: number }> = {},
      destination: RekordboxImportDestination = { kind: 'rekordbox' },
      choices: RekordboxImportChoices = { playlists: true, cues: false, bpm: false }
    ): RekordboxImportResult => {
      if (choices.playlists) applyRekordboxImport(db, readRekordboxFiles(filePaths), relinks, duplicates, destination)
      // Without the playlists the confirmed paths still decide which songs the cues and tempos go to.
      else rememberPathAliases(db, relinks)
      const cues = { songs: 0, cues: 0 }
      const bpm = { songs: 0 }
      if (choices.cues || choices.bpm) {
        // After the playlists, so songs just confirmed at another path are matched too.
        const match = trackMatcher(db)
        for (const collection of readRekordboxCollections(filePaths)) {
          if (choices.cues) {
            const got = importRekordboxCues(db, collection, match)
            cues.songs += got.songs
            cues.cues += got.cues
          }
          if (choices.bpm) bpm.songs += importRekordboxBpm(db, collection, match).songs
        }
      }
      return { nodes: getPlaylistNodes(db), cues: choices.cues ? cues : null, bpm: choices.bpm ? bpm : null }
    }
  )
  ipcMain.handle(
    'playlists:move',
    (_e, id: number, targetId: number | null, where: 'before' | 'after' | 'into'): PlaylistNode[] => {
      movePlaylistNode(db, id, targetId, where)
      return getPlaylistNodes(db)
    }
  )
  // m3u8 for Rekordbox: a playlist to a file, or a folder's playlists to
  // one file each in a chosen folder. File names lose characters macOS
  // and Windows don't allow.
  ipcMain.handle('playlists:exportM3u', async (event, id: number): Promise<{ files: number; songs: number } | null> => {
    const node = getPlaylistNodes(db).find((n) => n.id === id)
    if (!node) return null
    const window = BrowserWindow.fromWebContents(event.sender)
    const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Playlist'
    if (node.kind === 'playlist') {
      const options: SaveDialogOptions = {
        title: 'Export playlist for Rekordbox',
        defaultPath: join(app.getPath('documents'), `${safe(node.name)}.m3u8`),
        filters: [{ name: 'Playlist', extensions: ['m3u8'] }],
      }
      const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      const { text, songs } = playlistToM3u(db, id)
      writeFileSync(result.filePath, text, 'utf8')
      return { files: 1, songs }
    }
    const options: OpenDialogOptions = {
      title: `Export the playlists in ${node.name} for Rekordbox`,
      buttonLabel: 'Export here',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const dir = result.filePaths[0]
    if (result.canceled || !dir) return null
    let songs = 0
    const playlists = folderPlaylists(db, id)
    for (const playlist of playlists) {
      const m3u = playlistToM3u(db, playlist.id)
      songs += m3u.songs
      writeFileSync(join(dir, `${safe(playlist.name)}.m3u8`), m3u.text, 'utf8')
    }
    return { files: playlists.length, songs }
  })
  ipcMain.handle('playlists:detach', (_e, id: number): PlaylistNode[] => {
    detachPlaylistNode(db, id)
    return getPlaylistNodes(db)
  })
  ipcMain.handle('playlists:getTrackIds', (_e, playlistId: number): number[] => getPlaylistTrackIds(db, playlistId))
  ipcMain.handle('playlists:getNodeTrackIds', (_e, id: number): number[] => getNodeTrackIds(db, id))
  ipcMain.handle('playlists:forTrack', (_e, trackId: number): number[] => getTrackPlaylistIds(db, trackId))
  ipcMain.handle(
    'playlists:addTracks',
    (_e, playlistId: number, trackIds: number[]): { added: number; skipped: number; trackIds: number[]; nodes: PlaylistNode[] } => ({
      ...addTracksToPlaylist(db, playlistId, trackIds),
      trackIds: getPlaylistTrackIds(db, playlistId),
      nodes: getPlaylistNodes(db),
    })
  )
  ipcMain.handle(
    'playlists:removeTracks',
    (_e, playlistId: number, trackIds: number[]): { trackIds: number[]; nodes: PlaylistNode[] } => {
      removeTracksFromPlaylist(db, playlistId, trackIds)
      return { trackIds: getPlaylistTrackIds(db, playlistId), nodes: getPlaylistNodes(db) }
    }
  )
  ipcMain.handle(
    'playlists:setTracks',
    (_e, playlistId: number, trackIds: number[]): { trackIds: number[]; nodes: PlaylistNode[] } => {
      setPlaylistTrackIds(db, playlistId, trackIds)
      return { trackIds: getPlaylistTrackIds(db, playlistId), nodes: getPlaylistNodes(db) }
    }
  )
}
