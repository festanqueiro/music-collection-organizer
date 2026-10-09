import { describe, it, expect } from 'vitest'
import { describeAnalysisError } from './errorMessage'

describe('describeAnalysisError', () => {
  it('turns common failures into plain words', () => {
    expect(describeAnalysisError(new Error("ENOENT: no such file or directory, open '/x.aiff'"))).toMatch(/isn't there any more/)
    expect(describeAnalysisError(new Error('ffmpeg exited with code 1: ...\n/x.mp3: Invalid data found when processing input\n'))).toMatch(/damaged/)
    expect(describeAnalysisError(new Error('EDEADLK: resource deadlock avoided, read'))).toMatch(/Google Drive/)
    expect(describeAnalysisError(new Error('End-Of-Stream'))).toMatch(/still syncing with the cloud/)
  })

  it("otherwise keeps the last line of ffmpeg's log, without its prefix", () => {
    const log = 'ffmpeg exited with code 1: ffmpeg version 6\n  built with clang\n[aiff @ 0x1234] Unsupported codec id 0x1\n'
    expect(describeAnalysisError(new Error(log))).toBe('Unsupported codec id 0x1')
  })

  it('handles empty and long messages', () => {
    expect(describeAnalysisError(undefined)).toBe('Analysis failed for an unknown reason.')
    expect(describeAnalysisError(new Error('x'.repeat(300)))).toHaveLength(198)
  })
})
