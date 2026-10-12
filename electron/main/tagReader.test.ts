import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  it('is right for the lossless files the tag library takes for lossy, or reads wrong', async () => {
    // AIFF-C, byte-swapped PCM.
    const sowt = createTestToneEncoded(dir, 'sowt.aifc', ['-c:a', 'pcm_s16le', '-f', 'aiff'], 'Sowt')
    expect((await readFileTags(sowt)).bitDepth).toBe(16)
    // AIFF-C, 32-bit float.
    const float = createTestToneEncoded(dir, 'float.aiff', ['-c:a', 'pcm_f32be'], 'Float')
    expect((await readFileTags(float)).bitDepth).toBe(32)
    // A float WAV, which ffmpeg writes with a `fact` chunk.
    const floatWav = createTestToneEncoded(dir, 'float.wav', ['-c:a', 'pcm_f32le'], 'Float')
    expect((await readFileTags(floatWav)).bitDepth).toBe(32)
    // A lossy codec in an AIFF-C stays without one.
    const ima = createTestToneEncoded(dir, 'ima.aifc', ['-c:a', 'adpcm_ima_qt', '-f', 'aiff'], 'Ima')
    expect((await readFileTags(ima)).bitDepth).toBeNull()
  })

  it('reads a 24-bit Apple Lossless file as 24, whatever its sample entry says', async () => {
    const alac = createTestToneEncoded(dir, 'deep.m4a', ['-c:a', 'alac', '-sample_fmt', 's32p'], 'Deep')
    expect((await readFileTags(alac)).bitDepth).toBe(24)
    // Apple's encoder leaves 16 in the sample entry's size field (22 bytes
    // after its `alac`): written the same way here.
    const bytes = readFileSync(alac)
    const entry = bytes.indexOf(Buffer.from('alac'))
    expect(bytes.readUInt16BE(entry + 22)).toBe(24)
    bytes.writeUInt16BE(16, entry + 22)
    writeFileSync(alac, bytes)
    expect((await readFileTags(alac)).bitDepth).toBe(24)
    const plain = createTestToneEncoded(dir, 'plain.m4a', ['-c:a', 'alac', '-sample_fmt', 's16p'], 'Plain')
    expect((await readFileTags(plain)).bitDepth).toBe(16)
  })

  it('reaches tracks whose tags were read before the column existed, once', async () => {
    const wav = insert(createTestToneWav(dir), 'wav', ', 123')
    const mp3 = insert(createTestToneMp3(dir), 'mp3', ', 123')
    const broken = join(dir, 'broken.wav')
    writeFileSync(broken, 'not audio')
    const unreadable = insert(broken, 'wav', ', 123')
    expect(bitDepth(wav)).toBeNull()

    await readAll()

    expect(bitDepth(wav)).toBe(16)
    // Looked at, none to show: not NULL, so they aren't read again.
    expect(bitDepth(mp3)).toBe(NO_BIT_DEPTH)
    expect(bitDepth(unreadable)).toBe(NO_BIT_DEPTH)
    const left = db.prepare('SELECT count(*) AS n FROM tracks WHERE tags_read_at IS NULL OR bit_depth IS NULL').get() as { n: number }
    expect(left.n).toBe(0)
  })

  it('leaves a file that is not there for when it is back', async () => {
    // The collection's drive unplugged at launch: nothing is known about
    // the file, so nothing is written about it.
    const path = join(dir, 'later.wav')
    const gone = insert(path, 'wav')
    await readAll()
    expect(bitDepth(gone)).toBeNull()
    expect((db.prepare('SELECT tags_read_at AS at FROM tracks WHERE id = ?').get(gone) as { at: number | null }).at).toBeNull()

    createTestToneWav(dir, 'later.wav')
    await readAll()
    expect(bitDepth(gone)).toBe(16)
  })

  it('does not write tags read from a file that changed while it was parsed', async () => {
    const id = insert(createTestToneMp3(dir, 'saved.mp3', 'Old title'), 'mp3')
    const done = readAll()
    // A save lands before the parse returns: its values, a new mtime.
    db.prepare("UPDATE tracks SET title = 'New title', mtime = 2, tags_read_at = 5, bit_depth = 0 WHERE id = ?").run(id)
    await done
    expect((db.prepare('SELECT title FROM tracks WHERE id = ?').get(id) as { title: string }).title).toBe('New title')
  })
})
