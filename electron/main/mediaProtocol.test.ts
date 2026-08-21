import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { trackPathToMediaUrl, mediaUrlToFilePath } from './mediaProtocol'

describe('trackPathToMediaUrl / mediaUrlToFilePath', () => {
  let root: string
  let collectionFolder: string
  let outsideDir: string

  beforeEach(() => {
    // realpathSync here matters on macOS, where the OS tmpdir is itself a
    // symlink (/var -> /private/var) — without this, every "inside the
    // collection folder" assertion below would compare the symlink-resolved
    // path mediaUrlToFilePath returns against this test's un-resolved one.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'media-protocol-test-')))
    collectionFolder = join(root, 'Music')
    outsideDir = join(root, 'outside')
    mkdirSync(join(collectionFolder, 'House'), { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(collectionFolder, 'House', 'track one.wav'), 'x')
    writeFileSync(join(outsideDir, 'secret.wav'), 'x')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('round-trips a path inside the collection folder', () => {
    const trackPath = join(collectionFolder, 'House', 'track one.wav')
    const url = trackPathToMediaUrl(trackPath)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBe(trackPath)
  })

  it('round-trips the collection folder root itself', () => {
    const url = trackPathToMediaUrl(collectionFolder)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBe(collectionFolder)
  })

  it('rejects a path outside the collection folder', () => {
    const url = trackPathToMediaUrl(join(outsideDir, 'secret.wav'))
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('rejects a sibling directory that merely shares a name prefix', () => {
    const siblingDir = `${collectionFolder}-backup`
    mkdirSync(siblingDir, { recursive: true })
    writeFileSync(join(siblingDir, 'track.wav'), 'x')
    const url = trackPathToMediaUrl(join(siblingDir, 'track.wav'))
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('rejects path traversal attempts', () => {
    const url = trackPathToMediaUrl(join(collectionFolder, '..', 'outside', 'secret.wav'))
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('rejects a symlink inside the collection folder that points outside it', () => {
    const linkPath = join(collectionFolder, 'sneaky.wav')
    symlinkSync(join(outsideDir, 'secret.wav'), linkPath)
    const url = trackPathToMediaUrl(linkPath)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('accepts a symlink inside the collection folder that points to another file also inside it', () => {
    const linkPath = join(collectionFolder, 'alias.wav')
    const targetPath = join(collectionFolder, 'House', 'track one.wav')
    symlinkSync(targetPath, linkPath)
    const url = trackPathToMediaUrl(linkPath)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBe(targetPath)
  })

  it('returns null when no collection folder is configured', () => {
    const url = trackPathToMediaUrl(join(collectionFolder, 'House', 'track one.wav'))
    expect(mediaUrlToFilePath(url, null)).toBeNull()
  })

  it('returns null for a malformed URL', () => {
    expect(mediaUrlToFilePath('not a url', collectionFolder)).toBeNull()
  })

  it('returns null for a nonexistent file', () => {
    const url = trackPathToMediaUrl(join(collectionFolder, 'missing.wav'))
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })
})
