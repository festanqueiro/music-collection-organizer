import { app } from 'electron'
import { join } from 'node:path'

// Main-thread only (imports electron's app) — kept separate from
// audioTranscode.ts so that module stays safe to import from inside a
// worker_thread, which can't use Electron's app singleton.
// Where a file's original bytes wait while its tags are being saved
// (tagWriter.ts). Not in the media cache, which is pruned by size.
export function getTagEditRecoveryDir(): string {
  return join(app.getPath('userData'), 'tag-edit-recovery')
}

export function getMediaCacheDir(): string {
  return join(app.getPath('userData'), 'media-cache')
}
