import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARKER_FRESH_MS, clearOpenMarker, isOpenElsewhere, readOpenMarker, writeOpenMarker } from './openElsewhere'

describe('the "open on another computer" note', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'open-elsewhere-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('is read back as written, and is nothing when missing or not whole', () => {
    expect(readOpenMarker(dir)).toBeNull()
    writeOpenMarker(dir, 'studio-mac', 1000)
    expect(readOpenMarker(dir)).toEqual({ host: 'studio-mac', at: 1000 })
    writeFileSync(join(dir, 'open-on.json'), '{"host":')
    expect(readOpenMarker(dir)).toBeNull()
  })

  it('warns for a recent note of another computer only', () => {
    const now = 10_000_000
    expect(isOpenElsewhere({ host: 'laptop', at: now - 30_000 }, 'studio-mac', now)).toBe(true)
    // This computer's own (a crash), an old one (the other was closed), none.
    expect(isOpenElsewhere({ host: 'studio-mac', at: now - 30_000 }, 'studio-mac', now)).toBe(false)
    expect(isOpenElsewhere({ host: 'laptop', at: now - MARKER_FRESH_MS }, 'studio-mac', now)).toBe(false)
    expect(isOpenElsewhere(null, 'studio-mac', now)).toBe(false)
  })

  it('is cleared on quit by the computer that wrote it, not by another', () => {
    writeOpenMarker(dir, 'laptop', 1000)
    clearOpenMarker(dir, 'studio-mac')
    expect(readOpenMarker(dir)).not.toBeNull()
    clearOpenMarker(dir, 'laptop')
    expect(readOpenMarker(dir)).toBeNull()
  })
})
