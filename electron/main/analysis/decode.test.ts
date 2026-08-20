import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { decodeToPcm } from './decode'

describe('decodeToPcm', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decode-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('decodes a wav file to a non-empty Float32Array', async () => {
    const filePath = createTestToneWav(dir)
    const pcm = await decodeToPcm(filePath)
    expect(pcm).toBeInstanceOf(Float32Array)
    expect(pcm.length).toBeGreaterThan(40000) // ~1 second at 44100Hz
  })

  it('rejects for a nonexistent file', async () => {
    await expect(decodeToPcm(join(dir, 'missing.wav'))).rejects.toThrow()
  })
})
