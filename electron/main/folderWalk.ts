import { readdirSync, statSync, type Dirent } from 'node:fs'
import { join, extname } from 'node:path'
import type { DiskFile } from './scanDiff'

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac'])

export function walkAudioFiles(rootPath: string): DiskFile[] {
  const results: DiskFile[] = []

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
          results.push({ path: fullPath, size: stats.size, mtime: Math.floor(stats.mtimeMs) })
        } catch (err) {
          console.warn(`walkAudioFiles: skipping unreadable file ${fullPath}`, err)
        }
      }
    }
  }

  walk(rootPath)
  return results
}
