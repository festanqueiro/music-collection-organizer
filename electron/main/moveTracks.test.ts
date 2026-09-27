import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applyMoves, planMove } from './moveTracks'

describe('planMove', () => {
  const none = () => false

  it('leaves tracks already in the folder alone', () => {
    const plan = planMove([{ id: 1, path: '/music/house/a.wav' }], '/music/house', none)
    expect(plan).toEqual({ moves: [], alreadyThere: [1], conflicts: [] })
  })

  it('moves the others into it, keeping their file names', () => {
    const plan = planMove(
      [
        { id: 1, path: '/music/house/a.wav' },
        { id: 2, path: '/music/dub/b.flac' },
      ],
      '/music/dub',
      none
    )
    expect(plan.moves).toEqual([{ id: 1, from: '/music/house/a.wav', to: '/music/dub/a.wav' }])
    expect(plan.alreadyThere).toEqual([2])
  })

  it("doesn't overwrite a file of the same name, or move two of the same name there", () => {
    const plan = planMove(
      [
        { id: 1, path: '/music/a/x.wav' },
        { id: 2, path: '/music/b/x.wav' },
        { id: 3, path: '/music/b/y.wav' },
      ],
      '/music/dub',
      (path) => path === '/music/dub/y.wav'
    )
    expect(plan.moves.map((m) => m.id)).toEqual([1])
    expect(plan.conflicts.map((c) => c.id)).toEqual([2, 3])
  })
})

describe('applyMoves', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('moves the file and its database row together', async () => {
    dir = mkdtempSync(join(tmpdir(), 'move-test-'))
    mkdirSync(join(dir, 'a'))
    mkdirSync(join(dir, 'b'))
    const from = join(dir, 'a', 'song.wav')
    writeFileSync(from, 'audio')
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, folder TEXT NOT NULL)')
    db.prepare('INSERT INTO tracks (id, path, folder) VALUES (1, ?, ?)').run(from, join(dir, 'a'))

    const plan = planMove([{ id: 1, path: from }], join(dir, 'b'), existsSync)
    const result = await applyMoves(db, plan)

    const to = join(dir, 'b', 'song.wav')
    expect(result.moved).toEqual([{ id: 1, path: to, folder: join(dir, 'b') }])
    expect(existsSync(from)).toBe(false)
    expect(readFileSync(to, 'utf8')).toBe('audio')
    expect(db.prepare('SELECT path, folder FROM tracks WHERE id = 1').get()).toEqual({ path: to, folder: join(dir, 'b') })
  })

  it('keeps the old path when the file fails to move', async () => {
    dir = mkdtempSync(join(tmpdir(), 'move-test-'))
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, folder TEXT NOT NULL)')
    const from = join(dir, 'gone.wav')
    db.prepare('INSERT INTO tracks (id, path, folder) VALUES (1, ?, ?)').run(from, dir)

    const result = await applyMoves(db, { moves: [{ id: 1, from, to: join(dir, 'b', 'gone.wav') }], alreadyThere: [], conflicts: [] })

    expect(result.moved).toEqual([])
    expect(result.failed.map((f) => f.id)).toEqual([1])
    expect(db.prepare('SELECT path FROM tracks WHERE id = 1').get()).toEqual({ path: from })
  })
})
