import { describe, it, expect, beforeEach } from 'vitest'
import { failedInARow, trackFailed, trackPlayed, UNPLAYABLE_IN_A_ROW } from './unplayable'

describe('a track that will not play', () => {
  beforeEach(() => trackPlayed())

  it('is skipped when there is a next one', () => {
    expect(trackFailed(true)).toBe('skip')
  })

  it('stays where it is when there is nothing to go on to', () => {
    expect(trackFailed(false)).toBe('stop')
  })

  it('stops the queue after a few in a row (a drive unplugged)', () => {
    const answers = Array.from({ length: UNPLAYABLE_IN_A_ROW }, () => trackFailed(true))
    expect(answers).toEqual(['skip', 'skip', 'stop'])
    expect(failedInARow()).toBe(UNPLAYABLE_IN_A_ROW)
  })

  it('counts from the start again once a track has played', () => {
    trackFailed(true)
    trackFailed(true)
    trackPlayed()
    expect(trackFailed(true)).toBe('skip')
  })
})
