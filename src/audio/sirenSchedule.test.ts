import { describe, it, expect } from 'vitest'
import { stabTimesInWindow } from './sirenSchedule'

// Interval constants like 0.4 aren't exactly representable in binary
// floating point, so exact equality on computed stab times is the wrong
// check — compare element-by-element with a small tolerance instead.
function expectCloseArray(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9))
}

describe('stabTimesInWindow', () => {
  it('returns [] for a null interval (beat off)', () => {
    expect(stabTimesInWindow(null, 0, 1, null)).toEqual([])
  })

  it('a first call (lastStabTime null) fires immediately at fromTime', () => {
    expect(stabTimesInWindow(0.6, 10, 10.1, null)).toEqual([10])
  })

  it('a window shorter than the interval after an existing stab returns []', () => {
    // Last stab at t=10, interval 0.6 — next isn't due until 10.6, but this
    // tick's window only reaches 10.1.
    expect(stabTimesInWindow(0.6, 10, 10.1, 10)).toEqual([])
  })

  it('a window spanning several intervals returns them all in ascending order', () => {
    expectCloseArray(stabTimesInWindow(0.25, 0, 1.0, 0), [0.25, 0.5, 0.75, 1.0])
  })

  it('a late tick (a window much wider than one interval) does not skip stabs', () => {
    // Scheduler stalled — window covers several missed intervals at once.
    expectCloseArray(stabTimesInWindow(0.4, 0, 2.0, 0), [0.4, 0.8, 1.2, 1.6, 2.0])
  })

  it('consecutive calls fed the previous result never re-emit the same time', () => {
    const first = stabTimesInWindow(0.25, 0, 0.1, null)
    expect(first).toEqual([0])
    const lastStabTime = first[first.length - 1]
    const second = stabTimesInWindow(0.25, 0.1, 0.6, lastStabTime)
    expectCloseArray(second, [0.25, 0.5])
  })
})
