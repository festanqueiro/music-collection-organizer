import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav, createTestToneAiff } from '../../tests/fixtures/audioFixture'
import { needsTranscode, getPlayableFilePath } from './audioTranscode'

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
})
