import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../tests/fixtures/audioFixture'
import { waveformSection } from './waveformSection'

describe('waveformSection', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wave-section-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('decodes only the asked part, at the asked detail', async () => {
    const file = createTestToneWav(dir) // a 1 s tone
    const s = await waveformSection(file, dir, 0.5, 10, 200)
    expect(s.start).toBe(0.5)
    // Only the half second that's there, 200 peaks a second.
    expect(s.peaks.length).toBeGreaterThan(90)
    expect(s.peaks.length).toBeLessThan(110)
    expect(s.perSecond).toBeCloseTo(200, 0)
    expect(Math.max(...s.peaks)).toBeGreaterThan(0.1)
  })
})
