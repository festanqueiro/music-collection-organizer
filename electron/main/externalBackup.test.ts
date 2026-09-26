import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupFiles, checkDestination } from './externalBackup'

function collection() {
  const root = mkdtempSync(join(tmpdir(), 'mco-collection-'))
  mkdirSync(join(root, 'House'))
  writeFileSync(join(root, 'House', 'a.aiff'), 'aaaa')
  writeFileSync(join(root, 'b.wav'), 'bb')
  writeFileSync(join(root, '.DS_Store'), 'x')
  mkdirSync(join(root, '.mco'))
  writeFileSync(join(root, '.mco', 'collection.db'), 'live db')
  return root
}

const noop = () => {}

describe('checkDestination', () => {
  it('refuses a folder on the same disk as the collection', async () => {
    const source = collection()
    const dest = mkdtempSync(join(tmpdir(), 'mco-dest-'))
    expect(await checkDestination(dest, source)).toMatch(/same disk/)
  })

  it('refuses a folder inside the collection', async () => {
    const source = collection()
    expect(await checkDestination(join(source, 'House'), source)).toMatch(/inside the collection/)
  })

  it('reports a disk that is not connected', async () => {
    expect(await checkDestination('/Volumes/definitely-not-here', collection())).toMatch(/connected/)
  })
})

describe('backupFiles', () => {
  it('copies the files (not hidden ones), keeping folders and modification times', async () => {
    const source = collection()
    const dest = mkdtempSync(join(tmpdir(), 'mco-dest-'))
    const result = await backupFiles(source, join(dest, 'Files'), null, dest, noop, new AbortController().signal)
    expect(result).toMatchObject({ copied: 2, unchanged: 0, failed: 0, bytesCopied: 6 })
    expect(readFileSync(join(dest, 'Files', 'House', 'a.aiff'), 'utf8')).toBe('aaaa')
    expect(existsSync(join(dest, 'Files', '.DS_Store'))).toBe(false)
    expect(existsSync(join(dest, 'Files', '.mco'))).toBe(false)
  })

  it('only copies new and changed files the next time, and never deletes', async () => {
    const source = collection()
    const dest = mkdtempSync(join(tmpdir(), 'mco-dest-'))
    const signal = new AbortController().signal
    await backupFiles(source, join(dest, 'Files'), null, dest, noop, signal)
    writeFileSync(join(source, 'b.wav'), 'changed')
    utimesSync(join(source, 'b.wav'), new Date(), new Date(Date.now() + 10_000))
    writeFileSync(join(source, 'c.mp3'), 'new')
    const second = await backupFiles(source, join(dest, 'Files'), null, dest, noop, signal)
    expect(second).toMatchObject({ copied: 2, unchanged: 1 })
    expect(readFileSync(join(dest, 'Files', 'b.wav'), 'utf8')).toBe('changed')
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const dest = mkdtempSync(join(tmpdir(), 'mco-dest-'))
    expect(await backupFiles(collection(), join(dest, 'Files'), null, dest, noop, controller.signal)).toBeNull()
  })
})
