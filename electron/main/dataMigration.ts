import { existsSync, mkdirSync, copyFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Store from 'electron-store'

export interface MigrateDataFolderParams {
  newDataFolder: string
  oldDbPath: string
  oldConfigPath: string
  // Stamped into the migrated copy's collectionFolder field directly
  // (bypassing config.ts's own getStore()/setCollectionFolder — that
  // module's singleton is still pointed at the old location for the rest
  // of the current, about-to-relaunch process). Omitted when relocating
  // via config:chooseDbLocation, which doesn't touch collectionFolder.
  collectionFolderToStamp?: string
}

// Moves collection.db + config.json into newDataFolder.
//
// If newDataFolder already has a collection.db in it (e.g. the user is
// switching back to a collection folder used before), that existing data
// is adopted as-is rather than overwritten — the point is never to lose
// data, so an existing `.mco` always wins over whatever the current
// session happens to have open. Otherwise, whatever's currently at
// oldDbPath/oldConfigPath (which may itself be empty/fresh, on a
// brand-new install) is copied in as the starting point.
//
// Either way, the *old* files at oldDbPath/oldConfigPath are deliberately
// left where they were — never deleted — a cheap safety net alongside the
// daily backups (which always live in <userData>/backups and snapshot the
// live DB handle, so they keep working correctly after a move too).
export function migrateDataFolder({
  newDataFolder,
  oldDbPath,
  oldConfigPath,
  collectionFolderToStamp,
}: MigrateDataFolderParams): void {
  const newDbPath = join(newDataFolder, 'collection.db')
  const alreadyHasData = existsSync(newDbPath)

  if (!alreadyHasData) {
    mkdirSync(newDataFolder, { recursive: true })
    // Copied under another name and renamed when whole: a copy that stops
    // half way (disk full, the drive pulled) must not leave a
    // "collection.db" behind, which the next attempt would adopt as data
    // that was already there.
    const copyWhole = (from: string, to: string) => {
      const partial = `${to}.copying`
      try {
        copyFileSync(from, partial)
        renameSync(partial, to)
      } catch (err) {
        rmSync(partial, { force: true })
        throw err
      }
    }
    // The settings first, so the database — what "already has data" looks
    // for — is the last thing to appear.
    if (existsSync(oldConfigPath)) copyWhole(oldConfigPath, join(newDataFolder, 'config.json'))
    if (existsSync(oldDbPath)) copyWhole(oldDbPath, newDbPath)
  }

  if (collectionFolderToStamp) {
    const config = new Store<{ collectionFolder?: string; rescanAtLaunch?: boolean }>({ name: 'config', cwd: newDataFolder })
    // Data that was already there, for a collection that was somewhere else
    // (another computer, another drive): the next launch scans, so its
    // tracks are found at their new place (scan.ts) before anything shows.
    if (alreadyHasData && config.get('collectionFolder') !== collectionFolderToStamp) config.set('rescanAtLaunch', true)
    config.set('collectionFolder', collectionFolderToStamp)
  }
}
