import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type AppDatabase } from './db'
import { createTestToneWav } from '../../tests/fixtures/audioFixture'
import { downloadTrack } from './cloudDownload'

describe('downloadTrack', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'download-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('marks the track local and analyzed after download', async () => {
    const filePath = createTestToneWav(dir)
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime, cloud_status) VALUES (?, 'tone.wav', ?, 'wav', 1, 1, 'cloud_only')`
      )
      .run(filePath, dir).lastInsertRowid as number

    await downloadTrack(db, { id, path: filePath })

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.cloud_status).toBe('local')
    expect(row.analysis_status).toBe('done')
  })
})
