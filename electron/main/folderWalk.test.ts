import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkAudioFiles } from './folderWalk'

describe('walkAudioFiles', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'walk-test-'))
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(join(root, 'track1.wav'), 'x')
    writeFileSync(join(root, 'sub', 'track2.flac'), 'xx')
    writeFileSync(join(root, 'notes.txt'), 'ignore me')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('finds audio files recursively, ignores non-audio', () => {
    const files = walkAudioFiles(root)
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([join(root, 'sub', 'track2.flac'), join(root, 'track1.wav')])
  })

  it('finds AAC, M4A, OGG, and Opus files', () => {
    for (const name of ['a.m4a', 'b.aac', 'c.ogg', 'd.opus']) writeFileSync(join(root, name), 'x')
    const names = walkAudioFiles(root).map((f) => f.path.split('/').pop())
    expect(names).toEqual(expect.arrayContaining(['a.m4a', 'b.aac', 'c.ogg', 'd.opus']))
  })

  it('finds MP3 files, whatever the extension case', () => {
    writeFileSync(join(root, 'sub', 'track3.mp3'), 'xxx')
    writeFileSync(join(root, 'track4.MP3'), 'xxxx')
    const paths = walkAudioFiles(root).map((f) => f.path)
    expect(paths).toContain(join(root, 'sub', 'track3.mp3'))
    expect(paths).toContain(join(root, 'track4.MP3'))
  })

  it('reports correct size for each file', () => {
    const files = walkAudioFiles(root)
    const track1 = files.find((f) => f.path.endsWith('track1.wav'))!
    expect(track1.size).toBe(1)
  })

  it('never walks into a .mco data folder, even if it somehow contained audio-extension files', () => {
    const mcoDir = join(root, '.mco')
    mkdirSync(mcoDir)
    writeFileSync(join(mcoDir, 'collection.db'), 'not audio')
    writeFileSync(join(mcoDir, 'decoy.wav'), 'should never be picked up')

    const files = walkAudioFiles(root)
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([join(root, 'sub', 'track2.flac'), join(root, 'track1.wav')])
  })

  // Running as root ignores Unix permission bits entirely, so chmod 000
  // wouldn't actually block the read — skip there rather than assert
  // something false.
  it.skipIf(process.getuid?.() === 0)(
    'skips an unreadable subdirectory instead of aborting the whole walk',
    () => {
      const blockedDir = join(root, 'blocked')
      mkdirSync(blockedDir)
      writeFileSync(join(blockedDir, 'secret.wav'), 'x')
      chmodSync(blockedDir, 0o000)

      try {
        const files = walkAudioFiles(root)
        const paths = files.map((f) => f.path).sort()
        // The two originally-readable files are still found; nothing from
        // the unreadable directory is, and the call doesn't throw.
        expect(paths).toEqual([join(root, 'sub', 'track2.flac'), join(root, 'track1.wav')])
      } finally {
        // Restore permissions before afterEach's rmSync tries to clean up —
        // rmSync can't recurse into a directory it can't read either.
        chmodSync(blockedDir, 0o755)
      }
    }
  )
})
