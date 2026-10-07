// Hot cues A–H (docs/features/hot-cues.md): the slots' letters and default
// colours. The defaults are the colours the user's Rekordbox gives slots
// A–D (research/rekordbox-collection.md), then four more from its palette,
// all eight clearly different, so a cue keeps its colour both ways and no two
// pads look alike.
import type { TrackCue } from '../types'

export const HOT_CUE_SLOTS = 8
export const HOT_CUE_LETTERS = 'ABCDEFGH'

// A pink, B blue, C green, D purple, E orange, F cyan, G yellow, H magenta.
export const HOT_CUE_DEFAULT_COLORS = ['#ff376f', '#45acdb', '#7dc13d', '#aa72ff', '#e0641b', '#00e0ff', '#c3af04', '#de44cf']

// Rekordbox's hot-cue palette, to pick from.
export const HOT_CUE_PALETTE = [
  '#ff376f', '#ff127b', '#de44cf', '#aa72ff', '#6473ff', '#45acdb', '#00e0ff',
  '#3ceb50', '#28e214', '#7dc13d', '#c3af04', '#e0641b', '#e62828',
]

export function cueColor(cue: Pick<TrackCue, 'color' | 'slot'>): string {
  return cue.color ?? HOT_CUE_DEFAULT_COLORS[cue.slot] ?? '#9aa3b2'
}

export function cueLabel(cue: Pick<TrackCue, 'kind' | 'slot'>): string {
  return cue.kind === 'hot' ? (HOT_CUE_LETTERS[cue.slot] ?? '?') : cue.kind === 'loop' ? 'Loop' : 'Memory'
}

// The hot cue in each slot A–H (undefined where empty).
export function hotCueSlots(cues: TrackCue[]): (TrackCue | undefined)[] {
  return Array.from({ length: HOT_CUE_SLOTS }, (_, slot) => cues.find((c) => c.kind === 'hot' && c.slot === slot))
}

// "#rrggbb" ↔ [r, g, b] (Rekordbox's XML keeps them as numbers).
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

// The start of the tune is bar 0 of the beat grid: a setting of the track
// (Track.gridStart, ADR 0059), not a cue. It is 0:00 until the user moves
// it (ADR 0060) — MCO never guesses it, though it offers where analysis
// found the first beat (or, for a track analysed before that was kept,
// where the waveform first gets loud). The suggestions are every 16 bars
// from it, and bar 8 for a short intro (8, 16, 32, 48, 64 — where phrases
// change in most dance music): "16"
// is where the 17th bar begins, 16 × 4 × 60 / BPM seconds after the start.
// They move with it.
export const SUGGESTED_CUE_BARS = [8, 16, 32, 48, 64]

// The start marker's colour and its "slot" while it's dragged like a cue.
export const START_COLOR = '#9aa3b2'
export const START_SLOT = -1

export interface SuggestedCue {
  bar: number
  time: number
  // The hot cue already there (within half a beat), if any.
  slot: number | null
}

export interface GridSource {
  bpm: number | null
  firstBeat: number | null
  gridStart: number | null
  waveformPeaks: number[] | null
}

export function firstSoundTime(peaks: number[] | null, duration: number): number {
  if (!peaks || peaks.length === 0 || !(duration > 0)) return 0
  const max = Math.max(...peaks)
  if (!(max > 0)) return 0
  const i = peaks.findIndex((p) => p >= max * 0.1)
  return (Math.max(0, i) / peaks.length) * duration
}

// Where the tune seems to start — offered, never applied on its own.
export function detectedStart(track: Pick<GridSource, 'firstBeat' | 'waveformPeaks'>, duration: number): number {
  return Math.round((track.firstBeat ?? firstSoundTime(track.waveformPeaks, duration)) * 1000) / 1000
}

export function suggestedCues(track: GridSource, duration: number, cues: TrackCue[]): SuggestedCue[] {
  if (!track.bpm || !(track.bpm > 0) || !(duration > 0)) return []
  const beat = 60 / track.bpm
  const start = gridStart(track)
  const hot = cues.filter((c) => c.kind === 'hot')
  return SUGGESTED_CUE_BARS.map((bar) => Math.round((start + bar * 4 * beat) * 1000) / 1000)
    .map((time, i) => ({
      bar: SUGGESTED_CUE_BARS[i],
      time,
      slot: hot.find((c) => Math.abs(c.start - time) < beat / 2)?.slot ?? null,
    }))
    .filter((s) => s.time < duration - 1)
}

// The first empty slot (A first), or null when all eight are set.
export function firstEmptySlot(cues: TrackCue[]): number | null {
  const i = hotCueSlots(cues).findIndex((c) => !c)
  return i < 0 ? null : i
}

// Where the beat grid starts (bar 0): where the user put the start, else
// the very beginning of the file.
export function gridStart(track: Pick<GridSource, 'gridStart'>): number {
  return track.gridStart ?? 0
}

// Where `time` is on the grid, counted like the suggestions: whole bars
// since the first beat, then beats into the next bar (0–3). Before the
// first beat both are negative-floored (bar -1 …).
export function gridPosition(time: number, bpm: number, start: number): { bars: number; beats: number } {
  const beatsIn = Math.floor((time - start) / (60 / bpm) + 1e-6)
  const bars = Math.floor(beatsIn / 4)
  return { bars, beats: beatsIn - bars * 4 }
}

// The player's bar counter: whole bars since the start (bar 0 — so it
// reads 16 at the "16" suggestion), the beat in the bar (0–3), and how far
// through the current 16-bar phrase the track is (0–1). Null before the
// start or without a tempo.
export const PHRASE_BARS = 16
export function barCounter(time: number, bpm: number | null, start: number): { bar: number; beat: number; phrase: number } | null {
  if (!bpm || !(bpm > 0) || time < start) return null
  const { bars, beats } = gridPosition(time, bpm, start)
  return { bar: bars, beat: beats, phrase: ((bars % PHRASE_BARS) * 4 + beats) / (PHRASE_BARS * 4) }
}

// The nearest beat to `time`.
export function snapToBeat(time: number, bpm: number, start: number): number {
  const beat = 60 / bpm
  return Math.round((start + Math.round((time - start) / beat) * beat) * 1000) / 1000
}
