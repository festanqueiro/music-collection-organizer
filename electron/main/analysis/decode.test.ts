import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTestToneWav,
  createTestToneMp3,
  createTestToneM4a,
  createTestToneOgg,
} from '../../../tests/fixtures/audioFixture'
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

  it('decodes an mp3 file to a non-empty Float32Array', async () => {
    const filePath = createTestToneMp3(dir)
    const pcm = await decodeToPcm(filePath)
    expect(pcm).toBeInstanceOf(Float32Array)
    expect(pcm.length).toBeGreaterThan(40000)
  })

  it.each([
    ['m4a', createTestToneM4a],
    ['ogg', createTestToneOgg],
  ])('decodes an %s file to a non-empty Float32Array', async (_format, create) => {
    const pcm = await decodeToPcm(create(dir))
    expect(pcm.length).toBeGreaterThan(40000)
  })

  it('rejects for a nonexistent file', async () => {
    await expect(decodeToPcm(join(dir, 'missing.wav'))).rejects.toThrow()
  })
})
