// The messages MCO and its own Cast receiver app (cast-receiver/, running
// on the TV) exchange. Shared by both sides so they can't drift apart.

// MCO's Cast application, registered in the Google Cast SDK Developer
// Console with RECEIVER_URL as its receiver.
export const RECEIVER_APP_ID = 'E056A69A'
export const RECEIVER_URL = 'https://festanqueiro.github.io/music-collection-organizer/cast-receiver/'
export const RECEIVER_NAMESPACE = 'urn:x-cast:com.mco.receiver'

export type ReceiverPlayerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING'

// MCO → receiver.
export type ToReceiver =
  | {
      type: 'load'
      trackId: number
      url: string
      artworkUrl: string | null
      title: string
      artist: string | null
      position: number
      autoplay: boolean
    }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; position: number }

// Receiver → MCO: what the TV is playing. Sent on every change and once a
// second while playing; MCO's player follows it (see directCast.ts).
export interface ReceiverStatus {
  type: 'status'
  trackId: number | null
  playerState: ReceiverPlayerState
  idleReason: 'FINISHED' | 'ERROR' | null
  currentTime: number
}

export function isReceiverStatus(value: unknown): value is ReceiverStatus {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'status' && typeof v.playerState === 'string' && typeof v.currentTime === 'number'
}
