import { describe, it, expect } from 'vitest'
import { FrameClock } from './framePacer'

// Feeds the clock a sequence of tick times and returns which ones drew.
function drawnAt(clock: FrameClock, times: number[]): number[] {
  return times.filter((t) => clock.due(t))
}

const vsyncs = (hz: number, count: number, start = 0) => Array.from({ length: count }, (_, i) => start + (i * 1000) / hz)

describe('FrameClock', () => {
  it('draws every other vsync at 60 Hz for 30 fps', () => {
    const drawn = drawnAt(new FrameClock(1000 / 30), vsyncs(60, 60))
    expect(drawn).toHaveLength(30)
    const gaps = drawn.slice(1).map((t, i) => t - drawn[i])
    for (const gap of gaps) expect(gap).toBeCloseTo(1000 / 30, 5)
  })

  it('draws every fourth vsync at 120 Hz for 30 fps', () => {
    expect(drawnAt(new FrameClock(1000 / 30), vsyncs(120, 120))).toHaveLength(30)
  })

  it('tolerates vsyncs landing slightly early', () => {
    const jittered = vsyncs(60, 60).map((t, i) => t + (i % 2 ? -1.5 : 1.5))
    expect(drawnAt(new FrameClock(1000 / 30), jittered)).toHaveLength(30)
  })

  it('resyncs after a long stall instead of bursting catch-up frames', () => {
    const clock = new FrameClock(1000 / 30)
    drawnAt(clock, vsyncs(60, 10))
    // A 1s stall, then normal vsyncs again.
    const after = drawnAt(clock, vsyncs(60, 12, 1200))
    const gaps = after.slice(1).map((t, i) => t - after[i])
    for (const gap of gaps) expect(gap).toBeGreaterThan(30)
    expect(after.length).toBeLessThanOrEqual(7)
  })
})
