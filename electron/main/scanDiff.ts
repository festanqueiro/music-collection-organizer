export interface DiskFile {
  path: string
  size: number
  mtime: number
}

export interface DbTrackRow {
  path: string
  size: number
  mtime: number
}

export interface ScanDiff<T extends DiskFile = DiskFile> {
  toInsert: T[]
  toUpdate: T[]
  toRemove: string[]
}

// Generic over T (rather than fixed to DiskFile) so a caller passing a
// DiskFile subtype — e.g. walkAudioFiles's result, which also carries a
// `blocks` field scan.ts needs — gets that field back on toInsert/toUpdate
// without an extra cast, and without this module needing to know about it.
export function diffScan<T extends DiskFile>(diskFiles: T[], dbRows: DbTrackRow[]): ScanDiff<T> {
  const dbByPath = new Map(dbRows.map((r) => [r.path, r]))
  const diskPaths = new Set(diskFiles.map((f) => f.path))

  const toInsert: T[] = []
  const toUpdate: T[] = []
  for (const file of diskFiles) {
    const existing = dbByPath.get(file.path)
    if (!existing) {
      toInsert.push(file)
    } else if (existing.size !== file.size || existing.mtime !== file.mtime) {
      toUpdate.push(file)
    }
  }

  const toRemove = dbRows.filter((r) => !diskPaths.has(r.path)).map((r) => r.path)

  return { toInsert, toUpdate, toRemove }
}
