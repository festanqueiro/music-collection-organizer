// The Tags' and Subtags' IPC (docs/features/tags.md): the lists, creating,
// renaming, colouring and deleting them, a track's tags, and the tag data's
// export and import. Registered from ipc.ts.
import { app, ipcMain } from 'electron'
import { writeFileSync, readFileSync } from 'node:fs'
import {
  createGenre,
  createSubgenre,
  deleteGenre,
  deleteSubgenre,
  renameGenre,
  renameSubgenre,
  setGenreColor,
  setSubgenreColor,
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
import { buildRekordboxXml } from './rekordboxExport'
import type { Genre, Subgenre, ImportResult, GenreDeletionSnapshot, SubgenreDeletionSnapshot } from '../../src/types'
import type { TrackTagIds } from '../../src/state/tagFilter'
import { showOpenDialog, showSaveDialog } from './ipcDialogs'
import type { AppDatabase } from './db'

interface GenreRow {
  id: number
  name: string
  color: string | null
}

interface SubgenreRow {
  id: number
  name: string
  genre_id: number
  color: string | null
}

export function registerTagIpc(db: AppDatabase): void {
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
      color: r.color,
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
  ipcMain.handle('tags:setSubgenreColor', (_e, subgenreId: number, color: string | null): void =>
    setSubgenreColor(db, subgenreId, color)
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
