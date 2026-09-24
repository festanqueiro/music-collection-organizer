import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav, createTestToneAiff } from '../../tests/fixtures/audioFixture'
import { needsTranscode, getPlayableFilePath, pruneMediaCache } from './audioTranscode'

describe('needsTranscode', () => {
  it('is true for .aiff', () => {
    expect(needsTranscode('/music/track.aiff')).toBe(true)
  })

  it('is true for .aif', () => {
    expect(needsTranscode('/music/track.aif')).toBe(true)
  })

  it('is true regardless of case', () => {
    expect(needsTranscode('/music/track.AIFF')).toBe(true)
  })

  it('is false for .wav', () => {
    expect(needsTranscode('/music/track.wav')).toBe(false)
  })

  it('is false for .flac', () => {
    expect(needsTranscode('/music/track.flac')).toBe(false)
  })

  it('is false for a path with no extension', () => {
    expect(needsTranscode('/music/track')).toBe(false)
  })
})

describe('getPlayableFilePath', () => {
  let dir: string
  let cacheDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'transcode-test-'))
    cacheDir = join(dir, 'cache')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the original path unchanged for a non-AIFF file', async () => {
    const wavPath = createTestToneWav(dir)
    const result = await getPlayableFilePath(wavPath, cacheDir)
    expect(result).toBe(wavPath)
  })

  it('transcodes an AIFF file to a playable cached FLAC file', async () => {
    const aiffPath = createTestToneAiff(dir)
    const result = await getPlayableFilePath(aiffPath, cacheDir)
    expect(result).toMatch(/\.flac$/)
    expect(statSync(result).size).toBeGreaterThan(0)
  })

  it('reuses the cached file on a second call instead of re-transcoding', async () => {
    const aiffPath = createTestToneAiff(dir)
    const first = await getPlayableFilePath(aiffPath, cacheDir)
    const firstMtime = statSync(first).mtimeMs
    const second = await getPlayableFilePath(aiffPath, cacheDir)
    expect(second).toBe(first)
    expect(statSync(second).mtimeMs).toBe(firstMtime)
  })

  // Regression test: playback (main thread) and analysis (a worker_thread)
  // can both hit the same not-yet-cached AIFF at the same moment — e.g.
  // playing a pending track now auto-triggers its analysis. Both used to
  // write to the exact same .tmp filename, so whichever rename ran second
  // crashed with ENOENT because its source had already been moved by the
  // first. Two concurrent calls in the same process is as close as a test
  // can get to that cross-thread race without actually spinning up a
  // worker_thread.
  it('does not crash when two concurrent calls race on the same uncached file', async () => {
    const aiffPath = createTestToneAiff(dir)
    const [first, second] = await Promise.all([
      getPlayableFilePath(aiffPath, cacheDir),
      getPlayableFilePath(aiffPath, cacheDir),
    ])
    expect(first).toBe(second)
    expect(statSync(first).size).toBeGreaterThan(0)
  })

  it('shares one in-flight transcode between concurrent callers', async () => {
    const aiffPath = createTestToneAiff(dir)
    const first = getPlayableFilePath(aiffPath, cacheDir)
    const second = getPlayableFilePath(aiffPath, cacheDir)
    expect(second).toBe(first)
    await first
  })
})

describe('pruneMediaCache', () => {
  let cacheDir: string

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'media-cache-test-'))
  })

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true })
  })

  function writeCacheFile(name: string, bytes: number, ageSeconds: number): string {
    const path = join(cacheDir, name)
    writeFileSync(path, Buffer.alloc(bytes))
    const time = new Date(Date.now() - ageSeconds * 1000)
    utimesSync(path, time, time)
    return path
  }

  it('does nothing when the cache folder does not exist', () => {
    expect(() => pruneMediaCache(join(cacheDir, 'missing'), 0)).not.toThrow()
  })

  it('removes leftover .tmp files', () => {
    const tmp = writeCacheFile('abc.flac.123-dead.tmp', 10, 0)
    pruneMediaCache(cacheDir, 1_000_000)
    expect(existsSync(tmp)).toBe(false)
  })

  it('evicts the oldest files until under the size cap', () => {
    const oldest = writeCacheFile('a.flac', 100, 300)
    const middle = writeCacheFile('b.flac', 100, 200)
    const newest = writeCacheFile('c.flac', 100, 100)
    pruneMediaCache(cacheDir, 150)
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(middle)).toBe(false)
    expect(existsSync(newest)).toBe(true)
  })

  it('keeps everything when already under the cap', () => {
    const a = writeCacheFile('a.flac', 100, 300)
    mkdirSync(join(cacheDir, 'subdir'))
    pruneMediaCache(cacheDir, 1000)
    expect(existsSync(a)).toBe(true)
    expect(existsSync(join(cacheDir, 'subdir'))).toBe(true)
  })
})
