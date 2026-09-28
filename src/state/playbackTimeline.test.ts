import { describe, expect, it } from 'vitest'
import { PlaybackTimeline } from './playbackTimeline'

describe('PlaybackTimeline', () => {
  it('is idle with nothing recorded, or nothing loaded', () => {
    const timeline = new PlaybackTimeline()
    expect(timeline.at(1000).state).toBe('IDLE')
    timeline.push({ at: 0, trackId: null, currentTime: 0, duration: NaN, playing: false })
    expect(timeline.at(1000)).toEqual({ currentTime: 0, duration: NaN, state: 'IDLE' })
  })

  it('moves a playing track on in real time from the last sample, up to its end', () => {
    const timeline = new PlaybackTimeline()
    timeline.push({ at: 1000, trackId: 1, currentTime: 10, duration: 200, playing: true })
    expect(timeline.at(3500)).toEqual({ currentTime: 12.5, duration: 200, state: 'PLAYING' })
    expect(timeline.at(1_000_000).currentTime).toBe(200)
  })

  it('holds a paused track where it is', () => {
    const timeline = new PlaybackTimeline()
    timeline.push({ at: 1000, trackId: 1, currentTime: 42, duration: 200, playing: false })
    expect(timeline.at(5000)).toEqual({ currentTime: 42, duration: 200, state: 'PAUSED' })
  })

  it('answers for a moment in the past from the sample in force then', () => {
    const timeline = new PlaybackTimeline()
    timeline.push({ at: 0, trackId: 1, currentTime: 190, duration: 200, playing: true })
    timeline.push({ at: 5000, trackId: 2, currentTime: 0, duration: 300, playing: true })
    // 2 s behind, just after the track change: still the old track.
    expect(timeline.at(6000 - 2000)).toEqual({ currentTime: 194, duration: 200, state: 'PLAYING' })
    expect(timeline.at(8000 - 2000)).toEqual({ currentTime: 1, duration: 300, state: 'PLAYING' })
  })

  it('uses the oldest sample for a moment before any', () => {
    const timeline = new PlaybackTimeline()
    timeline.push({ at: 5000, trackId: 1, currentTime: 3, duration: 100, playing: true })
    expect(timeline.at(1000)).toEqual({ currentTime: 3, duration: 100, state: 'PLAYING' })
  })

  it('forgets old samples but keeps the one still in force', () => {
    const timeline = new PlaybackTimeline()
    timeline.push({ at: 0, trackId: 1, currentTime: 0, duration: 100, playing: false })
    timeline.push({ at: 1000, trackId: 1, currentTime: 50, duration: 100, playing: false })
    timeline.push({ at: 60_000, trackId: 2, currentTime: 7, duration: 100, playing: false })
    // The first is gone (the oldest left is used), the second still answers.
    expect(timeline.at(500).currentTime).toBe(50)
    expect(timeline.at(59_000).currentTime).toBe(50)
  })
})
