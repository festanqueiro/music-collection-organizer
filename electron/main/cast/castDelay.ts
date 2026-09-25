// How far behind MCO the cast device is playing, worked out from what the
// device reports (its position in the stream) and what MCO knows about
// when each bit of stream was produced. Pure, so it's testable without a
// device; castSession.ts polls the device and feeds these.

// Roughly how long captured audio/video takes to come out of the encoder:
// MediaRecorder's chunk interval plus ffmpeg's own buffering.
export const ENCODER_LATENCY_SECONDS = 0.4
// Used until (or if) the device reports enough to measure: three 2 s HLS
// segments of buffer plus encoding for TVs; speakers buffer less.
export const FALLBACK_DELAY_SECONDS = { video: 7, audio: 4 }
const MIN_DELAY_SECONDS = 0.5
const MAX_DELAY_SECONDS = 30

export interface MediaTimes {
  // Where the device is playing, in the stream's media time.
  currentTime: number
  // The live edge the device knows about (end of the newest segment in
  // the playlist it last fetched), same timeline — HLS only.
  liveEnd: number | null
}

// Pulls the playback position out of a MEDIA_STATUS message.
export function parseMediaTimes(message: { status?: unknown }): MediaTimes | null {
  const statuses = Array.isArray(message.status) ? (message.status as Array<Record<string, unknown>>) : []
  const status = statuses[0]
  if (!status || typeof status.currentTime !== 'number') return null
  const range = status.liveSeekableRange as { end?: unknown } | undefined
  return { currentTime: status.currentTime, liveEnd: typeof range?.end === 'number' ? range.end : null }
}

// HLS (TVs): the device sits (liveEnd - currentTime) behind the newest
// segment it knows about, and that segment's content was captured about
// when MCO published it. Assumes the device's newest segment is MCO's
// newest; if the device hasn't refetched the playlist yet it's one
// segment behind that, which makes this sample come out low by a segment
// — so callers take the highest recent sample (see combineHlsSamples).
export function hlsDelaySample(times: MediaTimes, playlistAgeSeconds: number): number | null {
  if (times.liveEnd === null) return null
  return playlistAgeSeconds + (times.liveEnd - times.currentTime) + ENCODER_LATENCY_SECONDS
}

// MP3 (speakers): MCO streams in real time from the moment the device
// connects, so media time t reached the device (and was captured) about
// t seconds after it connected.
export function mp3DelaySample(times: MediaTimes, listeningSeconds: number): number {
  return listeningSeconds - times.currentTime + ENCODER_LATENCY_SECONDS
}

// Every HLS sample is at most the true delay (see hlsDelaySample), so the
// highest of the recent ones is the best estimate.
export function combineHlsSamples(samples: number[]): number | null {
  if (samples.length === 0) return null
  return clampDelay(Math.max(...samples))
}

// MP3 samples scatter both ways (network timing), so take the median.
export function combineMp3Samples(samples: number[]): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return clampDelay(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
}

function clampDelay(seconds: number): number {
  return Math.min(MAX_DELAY_SECONDS, Math.max(MIN_DELAY_SECONDS, seconds))
}
