import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { decodeToPcm } from './decode'
import { detectBpmAndKey } from './bpmKey'

describe('detectBpmAndKey', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpmkey-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns numeric bpm and string key/scale without throwing', async () => {
    const filePath = createTestToneWav(dir)
    const pcm = await decodeToPcm(filePath)
    const result = detectBpmAndKey(pcm)
    expect(typeof result.bpm).toBe('number')
    expect(result.bpm).toBeGreaterThanOrEqual(0)
    expect(typeof result.key).toBe('string')
    expect(typeof result.scale).toBe('string')
  })
})
