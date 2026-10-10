import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type AppDatabase } from './db'
import { NO_BIT_DEPTH, TagReader, readFileTags, type TagReadProgress } from './tagReader'
import { createTestToneAiff, createTestToneEncoded, createTestToneMp3, createTestToneWav } from '../../tests/fixtures/audioFixture'

describe('the bit depth, read with the tags', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mco-tagreader-'))
    db = openDatabase(':memory:')
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const insert = (path: string, format: string, extra = '') =>
    db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime${extra ? ', tags_read_at' : ''}) VALUES (?, ?, ?, ?, 1, 1${extra})`).run(path, path, dir, format)
      .lastInsertRowid as number
  // One pass of the background reader, to its end.
  const readAll = () =>
    new Promise<void>((resolve) => {
      new TagReader(db, (progress: TagReadProgress) => progress.done && resolve()).run()
    })
  const bitDepth = (id: number) => (db.prepare('SELECT bit_depth FROM tracks WHERE id = ?').get(id) as { bit_depth: number | null }).bit_depth

  it('is the sample size of a lossless file, and nothing for a lossy one', async () => {
    expect((await readFileTags(createTestToneWav(dir))).bitDepth).toBe(16)
    expect((await readFileTags(createTestToneAiff(dir))).bitDepth).toBe(16)
    const deep = createTestToneEncoded(dir, 'deep.flac', ['-c:a', 'flac', '-sample_fmt', 's32', '-bits_per_raw_sample', '24'], 'Deep')
    expect((await readFileTags(deep)).bitDepth).toBe(24)
    expect((await readFileTags(createTestToneMp3(dir))).bitDepth).toBeNull()
  })

  it('reaches tracks whose tags were read before the column existed, once', async () => {
    const wav = insert(createTestToneWav(dir), 'wav', ', 123')
    const mp3 = insert(createTestToneMp3(dir), 'mp3', ', 123')
    const gone = insert(join(dir, 'gone.wav'), 'wav', ', 123')
    expect(bitDepth(wav)).toBeNull()

    await readAll()

    expect(bitDepth(wav)).toBe(16)
    // Looked at, none to show: not NULL, so they aren't read again.
    expect(bitDepth(mp3)).toBe(NO_BIT_DEPTH)
    expect(bitDepth(gone)).toBe(NO_BIT_DEPTH)
    const left = db.prepare('SELECT count(*) AS n FROM tracks WHERE tags_read_at IS NULL OR bit_depth IS NULL').get() as { n: number }
    expect(left.n).toBe(0)
  })
})
