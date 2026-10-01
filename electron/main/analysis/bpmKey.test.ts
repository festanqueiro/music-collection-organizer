import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { decodeToPcm } from './decode'
import { detectBpmAndKey, firstBeatFrom } from './bpmKey'

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
    expect(typeof result.firstBeat).toBe('number')
  })

  it('finds where the beat starts (the first beat), for suggested hot cues', () => {
    // Kick-like clicks at 120 BPM from 1.5 s, after silence.
    const rate = 44100
    const pcm = new Float32Array(rate * 30)
    for (let t = 1.5; t < 30; t += 0.5) {
      const at = Math.round(t * rate)
      for (let i = 0; i < 2000 && at + i < pcm.length; i++) pcm[at + i] = Math.sin(i / 8) * Math.exp(-i / 400)
    }
    const result = detectBpmAndKey(pcm)
    expect(result.bpm).toBeGreaterThan(115)
    expect(result.bpm).toBeLessThan(125)
    expect(Math.abs(result.firstBeat - 1.5)).toBeLessThan(0.06)
  })

  it('skips beats the tracker places in a silent intro', () => {
    const pcm = new Float32Array(44100 * 4)
    pcm.fill(0.5, 44100 * 2)
    expect(firstBeatFrom([0.5, 1, 1.5, 2.01, 2.5], pcm)).toBe(2.01)
    expect(firstBeatFrom([1.96, 2.46], pcm)).toBe(1.96)
    expect(firstBeatFrom([], pcm)).toBe(0)
  })
})
