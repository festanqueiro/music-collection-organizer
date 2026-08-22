import { app } from 'electron'
import { join } from 'node:path'
import { getDataFolder } from './bootstrap'

// Main-thread only (imports electron's app) — kept separate from
// bootstrap.ts so that module stays importable/testable under plain
// vitest. Every caller that needs the live collection.db's actual path
// goes through this one function so a relocation (see ipc.ts's
// migrateDataFolder) is picked up everywhere consistently: the startup
// openDatabase() call and backup:restore's destination both resolve
// through here, so a restore always lands wherever the DB currently
// lives, never wherever it used to.
export function getDbFilePath(): string {
  return join(getDataFolder() ?? app.getPath('userData'), 'collection.db')
}
