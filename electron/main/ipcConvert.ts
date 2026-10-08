// "Convert to…" over IPC (docs/features/convert.md). Registered from ipc.ts.
import { ipcMain, shell } from 'electron'
import { sep } from 'node:path'
import { convertTracks, defaultConvertDeps, probeAudio } from './convert'
import { getCollectionFolder } from './config'
import type { AudioInfo, ConvertOptions, ConvertResult } from '../../src/types'
import { showOpenDialog } from './ipcDialogs'
import type { AppDatabase } from './db'

export function registerConvertIpc(db: AppDatabase, sendToRenderer: (channel: string, payload: unknown) => void): void {
  // "Convert to…" (docs/features/convert.md). What a file is now, for the
  // dialog; the folder picker for somewhere else to save; and the
  // conversion itself, one run at a time, reporting after each file.
  ipcMain.handle('tracks:audioInfo', async (_e, trackId: number): Promise<AudioInfo | null> => {
    const row = db.prepare('SELECT path FROM tracks WHERE id = ? AND present = 1').get(trackId) as { path: string } | undefined
    if (!row) return null
    return probeAudio(row.path).catch(() => null)
  })
  ipcMain.handle('tracks:pickConvertFolder', async (e, defaultPath: string | null): Promise<string | null> => {
    const result = await showOpenDialog(e, {
      title: 'Save the converted files in',
      buttonLabel: 'Choose',
      defaultPath: defaultPath ?? undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
  let converting = false
  let stopConverting = false
  ipcMain.handle(
    'tracks:convert',
    async (_e, trackIds: number[], options: ConvertOptions): Promise<{ results: ConvertResult[]; rescan: boolean } | { error: string }> => {
      if (converting) return { error: 'A conversion is already running' }
      converting = true
      stopConverting = false
      try {
        const results = await convertTracks(
          db,
          defaultConvertDeps((path) => shell.trashItem(path)),
          trackIds,
          options,
          (progress) => sendToRenderer('tracks:convertProgress', progress),
          () => stopConverting
        )
        // Copies saved inside the collection are new tracks for a scan to find.
        const collectionFolder = getCollectionFolder()
        const rescan =
          !!collectionFolder && results.some((r) => r.status === 'converted' && !r.replaced && !!r.path && r.path.startsWith(collectionFolder + sep))
        return { results, rescan }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      } finally {
        converting = false
      }
    }
  )
  ipcMain.on('tracks:convertStop', () => {
    stopConverting = true
  })
}
