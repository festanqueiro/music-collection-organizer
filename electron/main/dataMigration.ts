import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
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
// daily backups (which always target the data folder's current value, so
// they keep working correctly after a move too).
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
    if (existsSync(oldDbPath)) copyFileSync(oldDbPath, newDbPath)
    if (existsSync(oldConfigPath)) copyFileSync(oldConfigPath, join(newDataFolder, 'config.json'))
  }

  if (collectionFolderToStamp) {
    new Store<{ collectionFolder?: string }>({ name: 'config', cwd: newDataFolder }).set(
      'collectionFolder',
      collectionFolderToStamp
    )
  }
}
