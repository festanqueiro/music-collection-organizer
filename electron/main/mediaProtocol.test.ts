import { describe, it, expect } from 'vitest'
import { trackPathToMediaUrl, mediaUrlToFilePath } from './mediaProtocol'

describe('trackPathToMediaUrl / mediaUrlToFilePath', () => {
  const collectionFolder = '/Users/dj/Music'

  it('round-trips a path inside the collection folder', () => {
    const trackPath = '/Users/dj/Music/House/track one.wav'
    const url = trackPathToMediaUrl(trackPath)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBe(trackPath)
  })

  it('round-trips the collection folder root itself', () => {
    const url = trackPathToMediaUrl(collectionFolder)
    expect(mediaUrlToFilePath(url, collectionFolder)).toBe(collectionFolder)
  })

  it('rejects a path outside the collection folder', () => {
    const url = trackPathToMediaUrl('/etc/passwd')
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('rejects a sibling directory that merely shares a name prefix', () => {
    const url = trackPathToMediaUrl('/Users/dj/Music-backup/track.wav')
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('rejects path traversal attempts', () => {
    const url = trackPathToMediaUrl('/Users/dj/Music/../../etc/passwd')
    expect(mediaUrlToFilePath(url, collectionFolder)).toBeNull()
  })

  it('returns null when no collection folder is configured', () => {
    const url = trackPathToMediaUrl('/Users/dj/Music/track.wav')
    expect(mediaUrlToFilePath(url, null)).toBeNull()
  })

  it('returns null for a malformed URL', () => {
    expect(mediaUrlToFilePath('not a url', collectionFolder)).toBeNull()
  })
})
