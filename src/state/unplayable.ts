// src/state/unplayable.ts
//
// A track that won't play (the file unplugged or moved, a format the player
// can't read) is skipped, with a toast (docs/features/queue.md). But a drive
// that was unplugged makes every track fail: after a few in a row the queue
// stops where it is instead of running through to its end.
export const UNPLAYABLE_IN_A_ROW = 3

let inARow = 0

// A track started playing: the next failure is the first again.
export function trackPlayed(): void {
  inARow = 0
}

// A track failed. 'skip': go on to the next one; 'stop': stay here (nothing
// to go on to, or too many in a row).
export function trackFailed(canGoOn: boolean): 'skip' | 'stop' {
  inARow++
  if (!canGoOn) return 'stop'
  return inARow < UNPLAYABLE_IN_A_ROW ? 'skip' : 'stop'
}

// How many have failed in a row, for the toast.
export const failedInARow = () => inARow
