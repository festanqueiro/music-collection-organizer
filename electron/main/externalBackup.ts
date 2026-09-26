// Backs up the collection — the database and settings, and every file in
// the collection folder — to a folder on another disk (an external drive,
// usually), under "MCO Backup/". Incremental: a file already backed up
// with the same size and modification time is skipped, so after the first
// run only new and changed files are copied. Nothing is ever deleted from
// the backup — a file removed from the collection stays there, which is
// the point of a backup.
//
// The destination must be on a different disk from the collection: a
// backup on the same disk is lost with it.
import { constants } from 'node:fs'
import { access, copyFile, mkdir, readdir, rename, stat, statfs, unlink, utimes } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { AppDatabase } from './db'
import { runBackup, pruneOldBackups } from './backup'
import { isCloudOnly } from './cloudDetect'
import type { ExternalBackupProgress, ExternalBackupResult } from '../../src/types'

export const BACKUP_ROOT_NAME = 'MCO Backup'
const DATABASE_BACKUPS_KEPT = 10
const PARTIAL_SUFFIX = '.mco-partial'

function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== '..')
}

// Why `destination` can't hold the backup, or null if it can.
export async function checkDestination(destination: string, collectionFolder: string): Promise<string | null> {
  let destStats
  try {
    destStats = await stat(destination)
  } catch {
    return 'That disk isn’t connected'
  }
  if (!destStats.isDirectory()) return 'That isn’t a folder'
  if (isInside(destination, collectionFolder) || isInside(collectionFolder, destination)) {
    return 'The backup can’t be inside the collection folder (or contain it)'
  }
  const collectionStats = await stat(collectionFolder)
  if (destStats.dev === collectionStats.dev) {
    return 'That’s the same disk as the collection — choose an external disk, so the backup survives if this one fails'
  }
  try {
    await access(destination, constants.W_OK)
  } catch {
    return 'MCO can’t write to that folder'
  }
  return null
}

interface SourceFile {
  path: string
  rel: string
  size: number
  mtimeMs: number
  cloudOnly: boolean
}

// Every file under `root`, except hidden ones (.DS_Store, ._ files, the
// .mco data folder — the database is backed up separately, from a
// consistent snapshot rather than the live file) and `exclude`.
async function listFiles(root: string, exclude: string | null, signal: AbortSignal): Promise<SourceFile[]> {
  const files: SourceFile[] = []
  const walk = async (dir: string) => {
    if (signal.aborted) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (exclude && isInside(path, exclude)) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        const s = await stat(path)
        files.push({
          path,
          rel: relative(root, path),
          size: s.size,
          mtimeMs: s.mtimeMs,
          cloudOnly: isCloudOnly({ size: s.size, blocks: s.blocks }),
        })
      }
    }
  }
  await walk(root)
  return files
}

async function isUpToDate(file: SourceFile, target: string): Promise<boolean> {
  try {
    const s = await stat(target)
    // mtimes are copied onto backed-up files; a second of slack for disks
    // (exFAT, FAT32) that store them coarsely.
    return s.size === file.size && Math.abs(s.mtimeMs - file.mtimeMs) < 2000
  } catch {
    return false
  }
}

export async function runExternalBackup(options: {
  db: AppDatabase
  configFilePath: string
  collectionFolder: string
  dataFolder: string | null
  destination: string
  onProgress: (progress: ExternalBackupProgress) => void
  signal: AbortSignal
}): Promise<ExternalBackupResult | null> {
  const { db, configFilePath, collectionFolder, dataFolder, destination, onProgress, signal } = options
  const problem = await checkDestination(destination, collectionFolder)
  if (problem) throw new Error(problem)

  const root = join(destination, BACKUP_ROOT_NAME)
  onProgress({ phase: 'scanning', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 })

  // Database and settings first — small, and the most important part.
  const databaseFolder = join(root, 'Database')
  runBackup(db, configFilePath, databaseFolder, new Date())
  try {
    pruneOldBackups(databaseFolder, DATABASE_BACKUPS_KEPT)
  } catch {
    // A failed prune doesn't fail the backup.
  }

  return backupFiles(collectionFolder, join(root, 'Files'), dataFolder, destination, onProgress, signal)
}

// Copies the collection's files into `filesRoot` (new and changed ones
// only); `spaceCheckPath` is where free space is measured.
export async function backupFiles(
  collectionFolder: string,
  filesRoot: string,
  exclude: string | null,
  spaceCheckPath: string,
  onProgress: (progress: ExternalBackupProgress) => void,
  signal: AbortSignal
): Promise<ExternalBackupResult | null> {
  const progress: ExternalBackupProgress = { phase: 'scanning', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 }
  const files = await listFiles(collectionFolder, exclude, signal)
  const result: ExternalBackupResult = {
    at: new Date().toISOString(),
    copied: 0,
    unchanged: 0,
    skippedCloudOnly: 0,
    failed: 0,
    bytesCopied: 0,
  }
  const toCopy: SourceFile[] = []
  for (const file of files) {
    if (signal.aborted) break
    if (file.cloudOnly) result.skippedCloudOnly++
    else if (await isUpToDate(file, join(filesRoot, file.rel))) result.unchanged++
    else toCopy.push(file)
  }
  if (signal.aborted) {
    onProgress({ ...progress, phase: 'cancelled' })
    return null
  }

  progress.phase = 'copying'
  progress.filesTotal = toCopy.length
  progress.bytesTotal = toCopy.reduce((sum, f) => sum + f.size, 0)
  const space = await statfs(spaceCheckPath)
  const free = space.bavail * space.bsize
  if (progress.bytesTotal > free) {
    const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`
    throw new Error(`Not enough space on that disk: ${gb(progress.bytesTotal)} to copy, ${gb(free)} free`)
  }
  onProgress({ ...progress })

  let lastReport = 0
  for (const file of toCopy) {
    if (signal.aborted) {
      onProgress({ ...progress, phase: 'cancelled' })
      return null
    }
    const target = join(filesRoot, file.rel)
    const partial = target + PARTIAL_SUFFIX
    try {
      await mkdir(join(target, '..'), { recursive: true })
      // Copied under a temporary name and renamed when complete, so an
      // interrupted copy never looks like a finished (up-to-date) one.
      await copyFile(file.path, partial)
      await utimes(partial, new Date(), new Date(file.mtimeMs))
      await rename(partial, target)
      result.copied++
      result.bytesCopied += file.size
    } catch (err) {
      console.error('backup: copying failed', file.path, err)
      result.failed++
      await unlink(partial).catch(() => {})
    }
    progress.filesDone++
    progress.bytesDone += file.size
    if (Date.now() - lastReport > 250) {
      lastReport = Date.now()
      onProgress({ ...progress })
    }
  }
  onProgress({ ...progress, phase: 'done' })
  return result
}
