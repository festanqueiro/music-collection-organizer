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

export interface ScanDiff {
  toInsert: DiskFile[]
  toUpdate: DiskFile[]
  toRemove: string[]
}

export function diffScan(diskFiles: DiskFile[], dbRows: DbTrackRow[]): ScanDiff {
  const dbByPath = new Map(dbRows.map((r) => [r.path, r]))
  const diskPaths = new Set(diskFiles.map((f) => f.path))

  const toInsert: DiskFile[] = []
  const toUpdate: DiskFile[] = []
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
