// While casting, the device plays a few seconds behind MCO. This keeps a
// short history of what MCO was playing and when, so the Player can show
// what the device is playing *now* — MCO's state `delay` seconds ago —
// and know when a change (play/pause, seek, CUE, a new track) hasn't
// reached the device yet.
//
// Module-level rather than per Player: the Player remounts per track, but
// for a few seconds after a track change the device is still playing the
// previous one.

export interface PlaybackSample {
  at: number // performance.now() ms
  trackId: number | null
  time: number // seconds into the track
  playing: boolean
}

export interface DelayedPosition {
  trackId: number | null
  time: number
  playing: boolean
}

const HISTORY_MS = 60_000

export class PlaybackTimeline {
  private samples: PlaybackSample[] = []
  private changes: number[] = []

  record(sample: PlaybackSample): void {
    this.samples.push(sample)
    this.prune(sample.at)
  }

  // A user-visible change (play/pause, seek, CUE, track load) happened at
  // `at` — the device will only reflect it `delay` later.
  markChange(at: number): void {
    this.changes.push(at)
    this.prune(at)
  }

  // What was playing `delayMs` before `now`, extrapolated from the last
  // sample at or before then (time keeps running while playing). Null
  // when there's no history that old — the device is still on something
  // from before MCO started recording this.
  positionAt(now: number, delayMs: number): DelayedPosition | null {
    const target = now - delayMs
    let found: PlaybackSample | null = null
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].at <= target) {
        found = this.samples[i]
        break
      }
    }
    if (!found) return null
    const time = found.playing ? found.time + (target - found.at) / 1000 : found.time
    return { trackId: found.trackId, time, playing: found.playing }
  }

  // True while some change hasn't reached the device yet.
  hasPendingChange(now: number, delayMs: number): boolean {
    const target = now - delayMs
    return this.changes.some((at) => at > target)
  }

  clear(): void {
    this.samples = []
    this.changes = []
  }

  private prune(now: number): void {
    const cutoff = now - HISTORY_MS
    // Keep the newest sample older than the cutoff: positionAt() may still
    // need it as the starting point for a long delay.
    let firstKept = 0
    while (firstKept + 1 < this.samples.length && this.samples[firstKept + 1].at < cutoff) firstKept++
    if (firstKept > 0) this.samples = this.samples.slice(firstKept)
    if (this.changes.length > 0 && this.changes[0] < cutoff) this.changes = this.changes.filter((at) => at >= cutoff)
  }
}

export const castTimeline = new PlaybackTimeline()
