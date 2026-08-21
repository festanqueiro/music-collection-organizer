import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, runInTransaction, type AppDatabase } from './db'

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

describe('runInTransaction', () => {
  let db: AppDatabase

  function setup() {
    db = openDatabase(':memory:')
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
  }

  afterEach(() => {
    db.close()
  })

  it('commits data from two sibling nested calls inside an outer call', () => {
    setup()

    runInTransaction(db, () => {
      runInTransaction(db, () => {
        db.prepare('INSERT INTO items (name) VALUES (?)').run('a')
      })
      runInTransaction(db, () => {
        db.prepare('INSERT INTO items (name) VALUES (?)').run('b')
      })
    })

    const rows = db.prepare('SELECT name FROM items ORDER BY name').all() as { name: string }[]
    expect(rows).toEqual([{ name: 'a' }, { name: 'b' }])
  })

  it('rolls back the whole outer transaction when a nested call throws, discarding an earlier sibling nested call', () => {
    setup()

    expect(() =>
      runInTransaction(db, () => {
        runInTransaction(db, () => {
          db.prepare('INSERT INTO items (name) VALUES (?)').run('a')
        })
        runInTransaction(db, () => {
          throw new Error('boom')
        })
      })
    ).toThrow('boom')

    const rows = db.prepare('SELECT name FROM items').all()
    expect(rows).toEqual([])
  })

  it('leaves nesting-depth tracking reset to 0 after a nested-call rollback, so a later unrelated transaction still works', () => {
    setup()

    expect(() =>
      runInTransaction(db, () => {
        runInTransaction(db, () => {
          throw new Error('boom')
        })
      })
    ).toThrow('boom')

    runInTransaction(db, () => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('c')
    })

    const rows = db.prepare('SELECT name FROM items').all()
    expect(rows).toEqual([{ name: 'c' }])
  })
})
