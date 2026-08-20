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

  it('flags missing files present = 0 instead of deleting them, preserving tags', () => {
    const filePath = join(root, 'b.wav')
    writeFileSync(filePath, 'x'.repeat(1000))
    runScan(db, root)
    const trackId = (db.prepare('SELECT id FROM tracks').get() as any).id
    db.prepare('INSERT INTO genres (name) VALUES (?)').run('House')
    const genreId = (db.prepare('SELECT id FROM genres').get() as any).id
    db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)

    unlinkSync(filePath)
    const result = runScan(db, root)
    expect(result.missing).toBe(1)

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as any
    expect(row).toBeDefined()
    expect(row.present).toBe(0)
    const tags = db.prepare('SELECT * FROM track_genres WHERE track_id = ?').all(trackId)
    expect(tags).toHaveLength(1)
  })

  it('revives a previously-missing file (and its tags) when it reappears at the same path', () => {
    const filePath = join(root, 'd.wav')
    writeFileSync(filePath, 'x'.repeat(1000))
    runScan(db, root)
    const trackId = (db.prepare('SELECT id FROM tracks').get() as any).id
    db.prepare('INSERT INTO moods (name) VALUES (?)').run('Energetic')
    const moodId = (db.prepare('SELECT id FROM moods').get() as any).id
    db.prepare('INSERT INTO track_moods (track_id, mood_id) VALUES (?, ?)').run(trackId, moodId)

    unlinkSync(filePath)
    runScan(db, root)
    expect((db.prepare('SELECT present FROM tracks WHERE id = ?').get(trackId) as any).present).toBe(0)

    writeFileSync(filePath, 'x'.repeat(1000))
    const result = runScan(db, root)
    expect(result.inserted).toBe(0)
    expect(result.updated).toBe(0)

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as any
    expect(row.present).toBe(1)
    const tags = db.prepare('SELECT * FROM track_moods WHERE track_id = ?').all(trackId)
    expect(tags).toHaveLength(1)
  })

  it('does not reprocess unchanged files on rescan', () => {
    writeFileSync(join(root, 'c.wav'), 'x'.repeat(1000))
    runScan(db, root)
    const second = runScan(db, root)
    expect(second.inserted).toBe(0)
    expect(second.updated).toBe(0)
  })
})
