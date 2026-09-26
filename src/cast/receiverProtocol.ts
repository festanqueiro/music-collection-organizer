// The messages MCO and its own Cast receiver app (cast-receiver/, running
// on the TV) exchange. Shared by both sides so they can't drift apart.
import type { EffectsSettings } from '../types'
import type { AnyVisualizerThemeId } from './tvVisualizers'

// MCO's Cast application, registered in the Google Cast SDK Developer
// Console with RECEIVER_URL as its receiver.
export const RECEIVER_APP_ID = 'E056A69A'
export const RECEIVER_URL = 'https://festanqueiro.github.io/music-collection-organizer/cast-receiver/'
export const RECEIVER_NAMESPACE = 'urn:x-cast:com.mco.receiver'

export type ReceiverPlayerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING'

// A track as the TV's now-playing screen shows it, already formatted on
// MCO's side (key in the user's notation, tags resolved to names).
export interface ReceiverTrackInfo {
  trackId: number
  title: string
  artist: string | null
  album: string | null
  year: number | null
  duration: number | null
  bpm: number | null
  key: string | null
  // The key's Camelot-wheel colour (as in MCO's Key column).
  keyColor: string | null
  format: string
  bitrate: number | null
  // When the file was added to the collection (epoch ms).
  addedAt: number | null
  // The name of the folder the file is in.
  folder: string
  playCount: number
  lastPlayedAt: number | null
  // LUFS, and a 1–10 rating; null until analysed.
  loudness: number | null
  energy: number | null
  genres: { name: string; color: string | null }[]
  subgenres: string[]
  // Filled in by MCO's main process, which serves the artwork; the URL
  // 404s for a track without any.
  artworkUrl: string | null
  // How this track follows the one before it in the queue (false for the
  // current track).
  keyMixes: boolean
  bpmMixes: boolean
  // The tempo change from the track before: "+2", "−3", "half-time",
  // "double-time", "±0"; null for the current track or an unknown BPM.
  bpmChange: string | null
}

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
  // What shapes the sound on the TV: MCO's FX chain settings (siren
  // included) and the player volume.
  | { type: 'effects'; settings: EffectsSettings; volume: number }
  // The Dub Siren's manual trigger, held or released.
  | { type: 'siren'; held: boolean }
  // What the TV shows: the visualizer (with its theme/options) or the
  // now-playing screen.
  | {
      type: 'display'
      showVisualizer: boolean
      theme: AnyVisualizerThemeId
      options: Record<string, string>
      hideTrackInfo: boolean
    }
  // The track playing now and what's queued after it.
  | {
      type: 'queue'
      current: ReceiverTrackInfo | null
      // The current track's waveform, a few hundred 0–1 peaks.
      waveform: number[] | null
      // The first few tracks after the current one.
      upNext: ReceiverTrackInfo[]
      // Every track after the current one: how many and how long.
      queuedCount: number
      queuedDuration: number
    }

// Receiver → MCO: what the TV is playing. Sent on every change and once a
// second while playing; MCO's player follows it (see directCast.ts).
export interface ReceiverStatus {
  type: 'status'
  trackId: number | null
  playerState: ReceiverPlayerState
  idleReason: 'FINISHED' | 'ERROR' | null
  currentTime: number
}

// The messages the renderer sends straight through (load and the
// transport go through the same commands as direct mode instead, since
// main has to turn a track id into a URL).
export type ReceiverSettingsMessage = Extract<ToReceiver, { type: 'effects' | 'siren' | 'display' | 'queue' }>

export function isReceiverSettingsMessage(value: unknown): value is ReceiverSettingsMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'effects' || type === 'siren' || type === 'display' || type === 'queue'
}

// Receiver → MCO, just before the receiver ends the session itself, so MCO
// can say why (instead of the session just vanishing).
export interface ReceiverGoodbye {
  type: 'goodbye'
  reason: 'hidden'
}

export function isReceiverGoodbye(value: unknown): value is ReceiverGoodbye {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'goodbye'
}

export function isReceiverStatus(value: unknown): value is ReceiverStatus {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'status' && typeof v.playerState === 'string' && typeof v.currentTime === 'number'
}
