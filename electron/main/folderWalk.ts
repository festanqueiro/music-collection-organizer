import { readdirSync, statSync, type Dirent } from 'node:fs'
import { join, extname } from 'node:path'
import type { DiskFile } from './scanDiff'

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac'])

// Carries the stat() call's `blocks` field (used by cloudDetect.ts's
// isCloudOnly heuristic) alongside the plain DiskFile shape — scan.ts's
// toRow() used to statSync() every file a second time just to read this,
// since it wasn't captured here.
export interface DiskFileWithBlocks extends DiskFile {
  blocks: number
}

export function walkAudioFiles(rootPath: string): DiskFileWithBlocks[] {
  const results: DiskFileWithBlocks[] = []

  function walk(dir: string) {
    // A single unreadable subdirectory (permissions, a broken mount point)
    // shouldn't abort scanning the rest of the collection.
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      console.warn(`walkAudioFiles: skipping unreadable directory ${dir}`, err)
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        // Same reasoning as the readdirSync guard above — a file that
        // vanishes or becomes unreadable between being listed and being
        // stat'd (a dangling symlink, a race with another process)
        // shouldn't abort the whole walk either.
        try {
          const stats = statSync(fullPath)
          results.push({
            path: fullPath,
            size: stats.size,
            mtime: Math.floor(stats.mtimeMs),
            blocks: (stats as unknown as { blocks?: number }).blocks ?? 0,
          })
        } catch (err) {
          console.warn(`walkAudioFiles: skipping unreadable file ${fullPath}`, err)
        }
      }
    }
  }

  walk(rootPath)
  return results
}
