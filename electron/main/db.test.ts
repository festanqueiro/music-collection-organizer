import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './db'

describe('openDatabase', () => {
  it('creates all expected tables', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
    expect(tables).toEqual([
      'genres',
      'moods',
      'subgenres',
      'track_genres',
      'track_moods',
      'track_subgenres',
      'tracks',
    ])
    db.close()
  })

  it('enforces genre cascade delete onto subgenres', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO genres (id, name) VALUES (1, ?)').run('House')
    db.prepare('INSERT INTO subgenres (id, name, genre_id) VALUES (1, ?, 1)').run('Deep House')
    db.prepare('DELETE FROM genres WHERE id = 1').run()
    const remaining = db.prepare('SELECT * FROM subgenres').all()
    expect(remaining).toEqual([])
    db.close()
  })

  describe('migrations', () => {
    let dir: string

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('adds the present column to a tracks table created before it existed, keeping existing rows', () => {
      dir = mkdtempSync(join(tmpdir(), 'db-migrate-test-'))
      const dbPath = join(dir, 'old.db')

      // Simulate a database from before the `present` column was added.
      const oldDb = new DatabaseSync(dbPath)
      oldDb.exec(`
        CREATE TABLE tracks (
          id INTEGER PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          filename TEXT NOT NULL,
          folder TEXT NOT NULL,
          format TEXT NOT NULL,
          size INTEGER NOT NULL,
          mtime INTEGER NOT NULL
        )
      `)
      oldDb.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'a.wav', '/', 'wav', 1, 1)`).run('/a.wav')
      oldDb.close()

      const db = openDatabase(dbPath)
      const row = db.prepare('SELECT * FROM tracks WHERE path = ?').get('/a.wav') as any
      expect(row).toBeDefined()
      expect(row.present).toBe(1)
      db.close()
    })
  })
})
