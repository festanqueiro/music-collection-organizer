// When a track counts as played: after 30 seconds of actual listening, or
// half of a track shorter than a minute. Seeking doesn't count as
// listening, so skimming through a track doesn't mark it played.
const PLAYED_AFTER_SECONDS = 30
// timeupdate fires every ~250ms; a bigger forward jump is a seek.
const MAX_TICK_SECONDS = 1.5

export function playedThreshold(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(PLAYED_AFTER_SECONDS, duration / 2) : PLAYED_AFTER_SECONDS
}

// How much of the move from `previous` to `current` was listening.
export function listenedSeconds(previous: number, current: number): number {
  const delta = current - previous
  return delta > 0 && delta <= MAX_TICK_SECONDS ? delta : 0
}
