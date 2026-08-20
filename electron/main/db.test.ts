import { describe, it, expect } from 'vitest'
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
})
