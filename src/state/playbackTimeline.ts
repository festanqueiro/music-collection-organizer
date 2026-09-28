// Where MCO's playback was at a moment in the recent past — for the second
// screen's now-playing progress, which runs the Visual delay behind the
// player (docs/features/second-screen.md). Fed a sample on every change
// (position, play/pause, track); between samples, a playing track is
// assumed to move on in real time.
import type { NowPlayingPlayback } from '../../cast-receiver/nowPlaying'

export interface PlaybackSample {
  // performance.now() when it was taken.
  at: number
  trackId: number | null
  currentTime: number
  duration: number
  playing: boolean
}

// Samples older than this are dropped (the Visual delay tops out at 3 s).
const KEEP_MS = 10_000

export class PlaybackTimeline {
  private samples: PlaybackSample[] = []

  push(sample: PlaybackSample): void {
    this.samples.push(sample)
    const cutoff = sample.at - KEEP_MS
    // Keep the newest sample from before the cutoff: it still says where
    // playback was until the next one.
    while (this.samples.length > 1 && this.samples[1].at <= cutoff) this.samples.shift()
  }

  at(time: number): NowPlayingPlayback {
    let sample: PlaybackSample | undefined
    for (const candidate of this.samples) {
      if (candidate.at > time) break
      sample = candidate
    }
    sample ??= this.samples[0]
    if (!sample || sample.trackId === null) return { currentTime: 0, duration: NaN, state: 'IDLE' }
    const elapsed = sample.playing ? Math.max(0, time - sample.at) / 1000 : 0
    const end = Number.isFinite(sample.duration) ? sample.duration : Infinity
    return {
      currentTime: Math.min(end, sample.currentTime + elapsed),
      duration: sample.duration,
      state: sample.playing ? 'PLAYING' : 'PAUSED',
    }
  }
}
