// Builds the 'queue' message for MCO's Cast receiver: the current track
// (the play queue's head) with everything the TV's now-playing screen
// shows, and a summary of what's queued after it.
import type { Genre, Subgenre, Track } from '../types'
import type { TrackTagIds } from '../state/tagFilter'
import { areBpmsCompatible, areKeysCompatible, camelotColor, formatKey, toCamelot, type KeyNotation } from '../state/harmonic'
import type { ReceiverSettingsMessage, ReceiverTrackInfo } from './receiverProtocol'

// How many upcoming tracks the TV lists by name.
export const UP_NEXT_COUNT = 4
// The TV draws the waveform at about this many bars.
const WAVEFORM_BARS = 200

export interface ReceiverQueueSource {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  trackTags: Map<number, TrackTagIds>
  playlist: number[]
  keyNotation: KeyNotation
}

function folderName(folder: string): string {
  return folder.split('/').filter(Boolean).pop() ?? folder
}

// How the tempo moves from one track to the next, as a DJ would read it.
export function bpmChange(from: number | null, to: number | null): string | null {
  if (!from || !to) return null
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.06
  if (!near(to, from) && near(to, from / 2)) return 'half-time'
  if (!near(to, from) && near(to, from * 2)) return 'double-time'
  const delta = Math.round(to) - Math.round(from)
  return delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `−${-delta}`
}

function titleOf(track: Track): string {
  return track.title || track.filename.replace(/\.[^.]+$/, '')
}

// Keeps each bucket's loudest peak, so short hits survive the shrink.
export function downsamplePeaks(peaks: number[], bars: number): number[] {
  if (peaks.length <= bars) return peaks
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * peaks.length) / bars)
    const to = Math.floor(((i + 1) * peaks.length) / bars)
    let max = 0
    for (let j = from; j < to; j++) max = Math.max(max, peaks[j])
    out.push(Math.round(max * 1000) / 1000)
  }
  return out
}

export function buildReceiverQueue(source: ReceiverQueueSource): ReceiverSettingsMessage {
  const byId = new Map(source.tracks.map((t) => [t.id, t]))
  const genresById = new Map(source.genres.map((g) => [g.id, g]))
  const subgenresById = new Map(source.subgenres.map((s) => [s.id, s]))

  const info = (track: Track, previous: Track | null): ReceiverTrackInfo => {
    const tags = source.trackTags.get(track.id)
    const camelot = toCamelot(track.musicalKey)
    return {
      trackId: track.id,
      title: titleOf(track),
      artist: track.artist,
      album: track.album,
      year: track.year,
      duration: track.duration,
      bpm: track.bpm,
      key: formatKey(track.musicalKey, source.keyNotation),
      keyColor: camelot ? camelotColor(camelot) : null,
      format: track.format,
      bitrate: track.bitrate,
      addedAt: track.birthtime,
      folder: folderName(track.folder),
      playCount: track.playCount,
      lastPlayedAt: track.lastPlayedAt,
      loudness: track.loudness,
      energy: track.energy,
      genres: (tags?.genreIds ?? [])
        .map((id) => genresById.get(id))
        .filter((g): g is Genre => !!g)
        .map((g) => ({ name: g.name, color: g.color })),
      subgenres: (tags?.subgenreIds ?? [])
        .map((id) => subgenresById.get(id)?.name)
        .filter((name): name is string => !!name),
      artworkUrl: null,
      keyMixes: !!previous && areKeysCompatible(previous.musicalKey, track.musicalKey),
      bpmMixes: !!previous && areBpmsCompatible(track.bpm, previous.bpm),
      bpmChange: previous ? bpmChange(previous.bpm, track.bpm) : null,
    }
  }

  const queue = source.playlist.map((id) => byId.get(id)).filter((t): t is Track => !!t)
  const [current, ...rest] = queue
  return {
    type: 'queue',
    current: current ? info(current, null) : null,
    waveform: current?.waveformPeaks ? downsamplePeaks(current.waveformPeaks, WAVEFORM_BARS) : null,
    upNext: rest.slice(0, UP_NEXT_COUNT).map((track, i) => info(track, queue[i])),
    queuedCount: rest.length,
    queuedDuration: rest.reduce((sum, t) => sum + (t.duration ?? 0), 0),
  }
}
