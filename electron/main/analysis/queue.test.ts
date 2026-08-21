import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type AppDatabase } from '../db'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { analyzeTrack, runAnalysisQueue } from './queue'

describe('analyzeTrack', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'queue-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('analyzes a track and marks it done', async () => {
    const filePath = createTestToneWav(dir)
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'tone.wav', ?, 'wav', 1, 1)`
      )
      .run(filePath, dir).lastInsertRowid as number

    await analyzeTrack(db, { id, path: filePath }, dir)

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.analysis_status).toBe('done')
    expect(row.duration).toBeGreaterThan(0.9)
    expect(typeof row.bpm).toBe('number')
    expect(JSON.parse(row.waveform_peaks)).toHaveLength(800)
  })

  it('marks a track as error if analysis throws', async () => {
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'missing.wav', '/', 'wav', 1, 1)`
      )
      .run(join(dir, 'missing.wav')).lastInsertRowid as number

    await analyzeTrack(db, { id, path: join(dir, 'missing.wav') }, dir)

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.analysis_status).toBe('error')
  })
})

describe('runAnalysisQueue', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'queue-multi-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('processes all given tracks and reports progress', async () => {
    // tracks.path has a UNIQUE constraint, so each row needs its own real fixture file
    // (rather than all rows sharing one path) for decode to succeed on every track.
    const filePaths = [0, 1, 2].map((i) => createTestToneWav(dir, `tone${i}.wav`))
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const id = db
        .prepare(
          `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, ?, ?, 'wav', 1, 1)`
        )
        .run(filePaths[i], `tone${i}.wav`, dir).lastInsertRowid as number
      ids.push(id)
    }

    const progressCalls: { done: number; total: number }[] = []
    await runAnalysisQueue(
      db,
      ids.map((id, i) => ({ id, path: filePaths[i] })),
      { concurrency: 2, cacheDir: dir, onProgress: (p) => progressCalls.push(p) }
    )

    const rows = db.prepare('SELECT analysis_status FROM tracks').all() as any[]
    expect(rows.every((r) => r.analysis_status === 'done')).toBe(true)
    expect(progressCalls[progressCalls.length - 1]).toEqual({ done: 3, total: 3 })
  })

  it('stops processing once the signal is aborted, leaving remaining tracks untouched', async () => {
    const filePaths = [0, 1, 2].map((i) => createTestToneWav(dir, `tone${i}.wav`))
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const id = db
        .prepare(
          `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, ?, ?, 'wav', 1, 1)`
        )
        .run(filePaths[i], `tone${i}.wav`, dir).lastInsertRowid as number
      ids.push(id)
    }

    const controller = new AbortController()
    await runAnalysisQueue(
      db,
      ids.map((id, i) => ({ id, path: filePaths[i] })),
      {
        concurrency: 1,
        cacheDir: dir,
        onProgress: (p) => {
          if (p.done === 1) controller.abort()
        },
        signal: controller.signal,
      }
    )

    const rows = db.prepare('SELECT id, analysis_status FROM tracks ORDER BY id').all() as any[]
    expect(rows[0].analysis_status).toBe('done')
    expect(rows[1].analysis_status).toBe('pending')
    expect(rows[2].analysis_status).toBe('pending')
  })
})
