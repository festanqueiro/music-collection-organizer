import { describe, it, expect } from 'vitest'
import { PlaybackTimeline } from './castTimeline'

describe('PlaybackTimeline', () => {
  it('reports the position from `delay` ago, extrapolating while playing', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 1000, trackId: 1, time: 10, playing: true })
    timeline.record({ at: 2000, trackId: 1, time: 11, playing: true })
    // 7s delay at t=9500 → what was playing at t=2500: 11s + 0.5s.
    expect(timeline.positionAt(9500, 7000)).toEqual({ trackId: 1, time: 11.5, playing: true })
  })

  it('holds the position while paused', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 1000, trackId: 1, time: 42, playing: false })
    expect(timeline.positionAt(20000, 7000)).toEqual({ trackId: 1, time: 42, playing: false })
  })

  it('shows a seek only once the delay has passed', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 0, trackId: 1, time: 0, playing: true })
    timeline.record({ at: 5000, trackId: 1, time: 120, playing: true }) // seeked to 2:00
    expect(timeline.positionAt(8000, 7000)?.time).toBeCloseTo(1, 5) // still before the seek
    expect(timeline.positionAt(12500, 7000)?.time).toBeCloseTo(120.5, 5)
  })

  it('keeps reporting the previous track until the new one reaches the device', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 0, trackId: 1, time: 200, playing: true })
    timeline.record({ at: 3000, trackId: 2, time: 0, playing: true })
    expect(timeline.positionAt(8000, 7000)?.trackId).toBe(1)
    expect(timeline.positionAt(10500, 7000)?.trackId).toBe(2)
  })

  it('has nothing to report before its history starts', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 5000, trackId: 1, time: 0, playing: true })
    expect(timeline.positionAt(6000, 7000)).toBeNull()
  })

  it('flags a change as pending until the delay has passed', () => {
    const timeline = new PlaybackTimeline()
    timeline.markChange(1000)
    expect(timeline.hasPendingChange(7000, 7000)).toBe(true)
    expect(timeline.hasPendingChange(8001, 7000)).toBe(false)
  })

  it('forgets old history but keeps a starting point for long delays', () => {
    const timeline = new PlaybackTimeline()
    timeline.record({ at: 0, trackId: 1, time: 0, playing: true })
    timeline.record({ at: 70_000, trackId: 1, time: 70, playing: true })
    expect(timeline.positionAt(71_000, 30_000)?.time).toBeCloseTo(41, 5)
  })
})
