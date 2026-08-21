// electron/main/analysis/metadata.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { extractMetadata } from './metadata'

describe('extractMetadata', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metadata-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('extracts duration from a wav file even with no tags', async () => {
    const filePath = createTestToneWav(dir)
    const meta = await extractMetadata(filePath)
    expect(meta.duration).toBeGreaterThan(0.9)
    expect(meta.duration).toBeLessThan(1.1)
    expect(meta.title).toBeNull()
  })
})
