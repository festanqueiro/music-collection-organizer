import { describe, it, expect } from 'vitest'
import { listenedSeconds, playedThreshold } from './playCount'

describe('playedThreshold', () => {
  it('is 30 seconds, or half a short track', () => {
    expect(playedThreshold(300)).toBe(30)
    expect(playedThreshold(40)).toBe(20)
    expect(playedThreshold(NaN)).toBe(30)
  })
})

describe('listenedSeconds', () => {
  it('counts normal playback ticks but not seeks', () => {
    expect(listenedSeconds(10, 10.25)).toBeCloseTo(0.25)
    expect(listenedSeconds(10, 90)).toBe(0)
    expect(listenedSeconds(90, 10)).toBe(0)
  })
})
