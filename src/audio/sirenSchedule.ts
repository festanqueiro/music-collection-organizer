// src/audio/sirenSchedule.ts
import type { SirenBeat } from '../types'

// Ported from the watchOS app's BeatClock.BeatDivision.stabIntervalSeconds.
export const BEAT_INTERVAL_SECONDS: Record<SirenBeat, number | null> = {
  off: null,
  slow: 0.6,
  medium: 0.4,
  fast: 0.25,
}

// Returns every stab time in (lastStabTime, untilTime], spaced by
// intervalSeconds, ascending. Empty when intervalSeconds is null.
// lastStabTime === null means "never fired" — the first stab is scheduled
// at fromTime, so enabling Beat fires immediately rather than after one
// silent interval.
export function stabTimesInWindow(
  intervalSeconds: number | null,
  fromTime: number,
  untilTime: number,
  lastStabTime: number | null
): number[] {
  if (intervalSeconds === null) return []

  // t = base + n * interval (multiplication against an integer step
  // count, not repeated addition) so error doesn't compound across a long
  // run of stabs — floating-point representation error in intervalSeconds
  // itself is unavoidable (e.g. 0.4 isn't exactly representable), but this
  // keeps each stab's error bounded to that single multiplication rather
  // than growing with n.
  const base = lastStabTime === null ? fromTime : lastStabTime
  const firstN = lastStabTime === null ? 0 : 1
  const times: number[] = []
  for (let n = firstN; ; n++) {
    const t = base + n * intervalSeconds
    if (t > untilTime) break
    if (t >= fromTime) times.push(t)
  }
  return times
}
