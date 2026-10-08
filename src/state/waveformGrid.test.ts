import { describe, it, expect } from 'vitest'
import { waveformGridLines } from './waveformGrid'

describe('waveformGridLines', () => {
  it('puts a line at every bar from the start of the tune, phrases marked', () => {
    // 120 BPM: a bar is 2 s.
    const lines = waveformGridLines(40, 120, 0.5)
    expect(lines.map((l) => l.time).slice(0, 4)).toEqual([0.5, 2.5, 4.5, 6.5])
    expect(lines).toHaveLength(20)
    expect(lines.filter((l) => l.strong).map((l) => l.bar)).toEqual([0, 16])
  })

  it('moves with the start', () => {
    expect(waveformGridLines(40, 120, 4)[0]).toEqual({ time: 4, bar: 0, strong: true })
  })

  it('thins out on a long track, keeping whole numbers of bars', () => {
    // 175 BPM, 10 minutes: 437 bars.
    const lines = waveformGridLines(600, 175, 0)
    expect(lines.length).toBeLessThanOrEqual(129)
    expect(lines[1].bar).toBe(4)
    expect(lines.filter((l) => l.strong).map((l) => l.bar).slice(0, 3)).toEqual([0, 16, 32])
  })

  it('marks every fourth line when the step is wider than a phrase', () => {
    const lines = waveformGridLines(600, 175, 0, 20)
    expect(lines[1].bar).toBe(32)
    expect(lines.filter((l) => l.strong).map((l) => l.bar).slice(0, 2)).toEqual([0, 128])
  })

  it('has nothing to draw without a tempo or a length', () => {
    expect(waveformGridLines(40, null, 0)).toEqual([])
    expect(waveformGridLines(0, 120, 0)).toEqual([])
    expect(waveformGridLines(40, 120, 50)).toEqual([])
  })
})
