import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { DiskFile } from './scanDiff'

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac'])

export function walkAudioFiles(rootPath: string): DiskFile[] {
  const results: DiskFile[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const stats = statSync(fullPath)
        results.push({ path: fullPath, size: stats.size, mtime: Math.floor(stats.mtimeMs) })
      }
    }
  }

  walk(rootPath)
  return results
}
