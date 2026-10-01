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

// Suggested hot cues: every 16 bars from the first beat (bars 16, 32, 48,
// 64 — where phrases change in most dance music), at 4 beats a bar. The
// first beat comes from analysis; for a track analysed before that existed,
// it's where the waveform first gets loud (approximate until re-analysed).
export const SUGGESTED_CUE_BARS = [16, 32, 48, 64]

export interface SuggestedCue {
  bar: number
  time: number
  // The hot cue already there (within half a beat), if any.
  slot: number | null
}

export function firstSoundTime(peaks: number[] | null, duration: number): number {
  if (!peaks || peaks.length === 0 || !(duration > 0)) return 0
  const max = Math.max(...peaks)
  if (!(max > 0)) return 0
  const i = peaks.findIndex((p) => p >= max * 0.1)
  return (Math.max(0, i) / peaks.length) * duration
}

export function suggestedCues(
  track: { bpm: number | null; firstBeat: number | null; waveformPeaks: number[] | null },
  duration: number,
  cues: TrackCue[]
): SuggestedCue[] {
  if (!track.bpm || !(track.bpm > 0) || !(duration > 0)) return []
  const beat = 60 / track.bpm
  const start = track.firstBeat ?? firstSoundTime(track.waveformPeaks, duration)
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
