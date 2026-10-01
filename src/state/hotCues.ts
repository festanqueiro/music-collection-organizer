// Hot cues A–H (docs/features/hot-cues.md): the slots' letters and default
// colours. The defaults are the colours the user's Rekordbox gives slots
// A–D (research/rekordbox-collection.md), then the rest of its palette, so a
// cue keeps its colour both ways.
import type { TrackCue } from '../types'

export const HOT_CUE_SLOTS = 8
export const HOT_CUE_LETTERS = 'ABCDEFGH'

export const HOT_CUE_DEFAULT_COLORS = ['#ff376f', '#45acdb', '#7dc13d', '#aa72ff', '#de44cf', '#00e0ff', '#28e214', '#ff127b']

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
