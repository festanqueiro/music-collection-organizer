import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type AppDatabase } from './db'
import { runScan } from './scan'

describe('runScan', () => {
  let root: string
  let db: AppDatabase

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scan-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('inserts newly found tracks as pending', () => {
    writeFileSync(join(root, 'a.wav'), 'x'.repeat(1000))
    const result = runScan(db, root)
    expect(result.inserted).toBe(1)
    const row = db.prepare('SELECT * FROM tracks').get() as any
    expect(row.analysis_status).toBe('pending')
    expect(row.filename).toBe('a.wav')
  })

  it('marks removed files gone from the DB on rescan', () => {
    const filePath = join(root, 'b.wav')
    writeFileSync(filePath, 'x'.repeat(1000))
    runScan(db, root)
    unlinkSync(filePath)
    const result = runScan(db, root)
    expect(result.removed).toBe(1)
    const row = db.prepare('SELECT * FROM tracks').get()
    expect(row).toBeUndefined()
  })

  it('does not reprocess unchanged files on rescan', () => {
    writeFileSync(join(root, 'c.wav'), 'x'.repeat(1000))
    runScan(db, root)
    const second = runScan(db, root)
    expect(second.inserted).toBe(0)
    expect(second.updated).toBe(0)
  })
})
