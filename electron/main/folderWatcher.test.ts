import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FolderWatcher, isRelevantChange } from './folderWatcher'
import { describeLibraryChange } from '../../src/state/libraryChange'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('isRelevantChange', () => {
  it('reacts to audio files and folders', () => {
    expect(isRelevantChange('Dub/track.MP3')).toBe(true)
    expect(isRelevantChange('track.flac')).toBe(true)
    expect(isRelevantChange('New Album')).toBe(true)
    expect(isRelevantChange(null)).toBe(true)
  })

  it("ignores the app's data folder, Finder metadata, and non-audio files", () => {
    expect(isRelevantChange('.mco/collection.db')).toBe(false)
    expect(isRelevantChange('.mco/collection.db-journal')).toBe(false)
    expect(isRelevantChange('Dub/._track.mp3')).toBe(false)
    expect(isRelevantChange('Dub/.DS_Store')).toBe(false)
    expect(isRelevantChange('Dub/cover.jpg')).toBe(false)
    expect(isRelevantChange('Dub/track.mp3.crdownload')).toBe(false)
  })
})

describe('describeLibraryChange', () => {
  it('summarizes what changed', () => {
    expect(describeLibraryChange({ inserted: 3, updated: 0, missing: 1 })).toBe('3 new tracks, 1 missing')
    expect(describeLibraryChange({ inserted: 1, updated: 1, missing: 0 })).toBe('1 new track, 1 changed track')
    expect(describeLibraryChange({ inserted: 0, updated: 0, missing: 0 })).toBe('')
  })
})

describe('FolderWatcher', () => {
  let dir: string
  let watcher: FolderWatcher
  let calls: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watch-test-'))
    mkdirSync(join(dir, 'sub'))
    mkdirSync(join(dir, '.mco'))
    calls = 0
    watcher = new FolderWatcher({ debounceMs: 150, onChange: () => calls++ })
  })

  afterEach(() => {
    watcher.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('debounces a burst of audio changes (in subfolders too) into one callback', async () => {
    watcher.start(dir)
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, 'sub', `t${i}.mp3`), 'x')
    await sleep(600)
    expect(calls).toBe(1)
  })

  it("ignores writes to the app's own data folder and non-audio files", async () => {
    watcher.start(dir)
    writeFileSync(join(dir, '.mco', 'collection.db'), 'x')
    writeFileSync(join(dir, 'sub', 'notes.txt'), 'x')
    await sleep(500)
    expect(calls).toBe(0)
  })

  it('stops reacting once stopped', async () => {
    watcher.start(dir)
    watcher.stop()
    writeFileSync(join(dir, 'late.mp3'), 'x')
    await sleep(400)
    expect(calls).toBe(0)
    expect(watcher.watchedFolder).toBeNull()
  })

  it('does not throw for a folder that does not exist', () => {
    expect(() => watcher.start(join(dir, 'missing'))).not.toThrow()
    expect(watcher.watchedFolder).toBeNull()
  })
})
