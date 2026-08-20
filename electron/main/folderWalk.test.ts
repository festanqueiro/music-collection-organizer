import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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

  it('reports correct size for each file', () => {
    const files = walkAudioFiles(root)
    const track1 = files.find((f) => f.path.endsWith('track1.wav'))!
    expect(track1.size).toBe(1)
  })
})
