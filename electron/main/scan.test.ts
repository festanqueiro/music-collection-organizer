import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
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
    // Already flagged: a later scan doesn't count it again.
    expect(runScan(db, root).missing).toBe(0)

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as any
    expect(row).toBeDefined()
    expect(row.present).toBe(0)
    const tags = db.prepare('SELECT * FROM track_genres WHERE track_id = ?').all(trackId)
    expect(tags).toHaveLength(1)
  })

  it('removeMissing deletes missing tracks under the folder, with their tags, including earlier-missing ones', () => {
    writeFileSync(join(root, 'keep.wav'), 'x'.repeat(1000))
    writeFileSync(join(root, 'old.wav'), 'x'.repeat(1000))
    writeFileSync(join(root, 'new.wav'), 'x'.repeat(1000))
    runScan(db, root)
    db.prepare('INSERT INTO genres (name) VALUES (?)').run('House')
    db.prepare('INSERT INTO track_genres (track_id, genre_id) SELECT id, 1 FROM tracks').run()
    // Missing since an earlier scan, and missing as of this one.
    unlinkSync(join(root, 'old.wav'))
    runScan(db, root)
    unlinkSync(join(root, 'new.wav'))
    // A track from a previous collection folder is left alone.
    db.prepare("INSERT INTO tracks (path, filename, folder, format, size, mtime, present) VALUES ('/elsewhere/x.wav', 'x.wav', '/elsewhere', 'wav', 1, 1, 0)").run()

    const result = runScan(db, root, { removeMissing: true })
    expect(result.removed).toBe(2)
    expect(result.missing).toBe(0)
    const paths = (db.prepare('SELECT path FROM tracks ORDER BY path').all() as any[]).map((r) => r.path)
    expect(paths).toEqual(['/elsewhere/x.wav', join(root, 'keep.wav')])
    expect(db.prepare('SELECT COUNT(*) AS n FROM track_genres').get()).toEqual({ n: 1 })
  })

  it('removeMissing removes nothing when the folder has no files (e.g. an unmounted drive)', () => {
    writeFileSync(join(root, 'a.wav'), 'x'.repeat(1000))
    runScan(db, root)
    unlinkSync(join(root, 'a.wav'))
    const result = runScan(db, root, { removeMissing: true })
    expect(result.removed).toBe(0)
    expect(result.missing).toBe(1)
    expect((db.prepare('SELECT present FROM tracks').get() as any).present).toBe(0)
  })

  it('removeMissing leaves the tracks of a folder that could not be read', () => {
    mkdirSync(join(root, 'locked'))
    writeFileSync(join(root, 'locked', 'kept.wav'), 'x'.repeat(1000))
    writeFileSync(join(root, 'here.wav'), 'x'.repeat(1000))
    writeFileSync(join(root, 'gone.wav'), 'x'.repeat(1000))
    runScan(db, root)
    unlinkSync(join(root, 'gone.wav'))
    chmodSync(join(root, 'locked'), 0o000)
    try {
      const result = runScan(db, root, { removeMissing: true })
      expect(result.removed).toBe(1)
      const paths = (db.prepare('SELECT path FROM tracks ORDER BY path').all() as any[]).map((r) => r.path)
      expect(paths).toEqual([join(root, 'here.wav'), join(root, 'locked', 'kept.wav')])
    } finally {
      chmodSync(join(root, 'locked'), 0o755)
    }
  })

  it('clears a stale cloud-only flag once the file is downloaded, even though it looks unchanged', () => {
    writeFileSync(join(root, 'c.wav'), 'x'.repeat(5000))
    runScan(db, root)
    // As if it had been a Drive placeholder at the last scan and was
    // downloaded since (same size and mtime).
    db.prepare("UPDATE tracks SET cloud_status = 'cloud_only'").run()
    const result = runScan(db, root)
    expect(result.updated).toBe(0)
    expect((db.prepare('SELECT cloud_status FROM tracks').get() as any).cloud_status).toBe('local')
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
    // Whether this lands as "unchanged, just revived" or "updated" (present
    // is set either way) depends on filesystem mtime resolution — recreating
    // the file may or may not produce a new mtime within the test's window.
    // Both are correct; what matters is it's never re-inserted, and present
    // + tags end up right either way (asserted below).

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

  describe('a collection that moved', () => {
    let other: string
    beforeEach(() => {
      other = mkdtempSync(join(tmpdir(), 'scan-moved-'))
    })
    afterEach(() => rmSync(other, { recursive: true, force: true }))

    const put = (base: string, inside: string, bytes: number) => {
      mkdirSync(join(base, inside, '..'), { recursive: true })
      writeFileSync(join(base, inside), 'x'.repeat(bytes))
    }

    it('keeps each track, with what is on it, at its new path', () => {
      put(root, 'House/a.wav', 1000)
      put(root, 'b.wav', 2000)
      runScan(db, root)
      db.prepare("UPDATE tracks SET analysis_status = 'done', bpm = 124").run()
      const before = db.prepare('SELECT id, filename FROM tracks ORDER BY filename').all() as any[]

      put(other, 'House/a.wav', 1000)
      put(other, 'b.wav', 2000)
      const result = runScan(db, other)

      expect(result).toMatchObject({ moved: 2, inserted: 0, missing: 0 })
      const rows = db.prepare('SELECT id, filename, path, folder, bpm, analysis_status, present FROM tracks ORDER BY filename').all() as any[]
      expect(rows.map((r) => r.id)).toEqual(before.map((r) => r.id))
      expect(rows.map((r) => r.path)).toEqual([join(other, 'House/a.wav'), join(other, 'b.wav')])
      expect(rows[0].folder).toBe(join(other, 'House'))
      expect(rows.every((r) => r.bpm === 124 && r.analysis_status === 'done' && r.present === 1)).toBe(true)
      // And nothing more to do on the next scan.
      expect(runScan(db, other)).toMatchObject({ moved: 0, inserted: 0, updated: 0, missing: 0 })
    })

    it('takes a file of another size, or at another place inside the folder, as new', () => {
      put(root, 'House/a.wav', 1000)
      put(root, 'House/b.wav', 1000)
      runScan(db, root)
      put(other, 'House/a.wav', 1001)
      put(other, 'Techno/b.wav', 1000)
      expect(runScan(db, other)).toMatchObject({ moved: 0, inserted: 2 })
      expect((db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as any).n).toBe(4)
    })

    it('does not guess between two tracks it could be', () => {
      put(root, 'a.wav', 1000)
      put(other, 'a.wav', 1000)
      runScan(db, root)
      runScan(db, other)
      // Both known, at root and at other (which took root's row): a third
      // place has two candidates once neither is on disk.
      db.prepare('INSERT INTO tracks (path, filename, folder, format, size, mtime, birthtime, cloud_status, analysis_status) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)').run(
        join(root, 'a.wav'), 'a.wav', root, 'wav', 1000, 'local', 'pending'
      )
      const third = mkdtempSync(join(tmpdir(), 'scan-third-'))
      try {
        put(third, 'a.wav', 1000)
        expect(runScan(db, third)).toMatchObject({ moved: 0, inserted: 1 })
      } finally {
        rmSync(third, { recursive: true, force: true })
      }
    })
  })
})
