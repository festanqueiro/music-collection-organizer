import { describe, it, expect } from 'vitest'
import {
  ENCODER_LATENCY_SECONDS,
  parseMediaTimes,
  hlsDelaySample,
  mp3DelaySample,
  combineHlsSamples,
  combineMp3Samples,
} from './castDelay'

describe('parseMediaTimes', () => {
  it('reads the position and live edge from a MEDIA_STATUS', () => {
    const message = { status: [{ currentTime: 41.5, liveSeekableRange: { start: 30, end: 47.4 } }] }
    expect(parseMediaTimes(message)).toEqual({ currentTime: 41.5, liveEnd: 47.4 })
  })

  it('leaves the live edge null when the device does not report one', () => {
    expect(parseMediaTimes({ status: [{ currentTime: 3 }] })).toEqual({ currentTime: 3, liveEnd: null })
  })

  it('returns null without a status', () => {
    expect(parseMediaTimes({ status: [] })).toBeNull()
    expect(parseMediaTimes({})).toBeNull()
  })
})

describe('HLS delay', () => {
  it('adds the playlist age to how far the device sits behind its live edge', () => {
    const sample = hlsDelaySample({ currentTime: 40, liveEnd: 46 }, 0.8)
    expect(sample).toBeCloseTo(6.8 + ENCODER_LATENCY_SECONDS, 5)
  })

  it('cannot measure without a live edge', () => {
    expect(hlsDelaySample({ currentTime: 40, liveEnd: null }, 0.8)).toBeNull()
  })

  it('takes the highest sample, since a stale playlist on the device only makes samples low', () => {
    expect(combineHlsSamples([5.1, 7.1, 6.9, 5.2])).toBeCloseTo(7.1, 5)
    expect(combineHlsSamples([])).toBeNull()
  })

  it('clamps nonsense to a sane range', () => {
    expect(combineHlsSamples([120])).toBe(30)
    expect(combineHlsSamples([-3])).toBe(0.5)
  })
})

describe('MP3 delay', () => {
  it('is time connected minus time played', () => {
    expect(mp3DelaySample({ currentTime: 56, liveEnd: null }, 60)).toBeCloseTo(4 + ENCODER_LATENCY_SECONDS, 5)
  })

  it('takes the median of the recent samples', () => {
    expect(combineMp3Samples([4.2, 9, 4.4])).toBeCloseTo(4.4, 5)
    expect(combineMp3Samples([4, 5])).toBeCloseTo(4.5, 5)
  })
})
