export interface Track {
  id: number
  path: string
  filename: string
  folder: string
  format: string
  size: number
  mtime: number
  duration: number | null
  title: string | null
  artist: string | null
  album: string | null
  genreTag: string | null
  year: number | null
  bpm: number | null
  musicalKey: string | null
  waveformPeaks: number[] | null
  cloudStatus: 'local' | 'cloud_only'
  analysisStatus: 'pending' | 'analyzing' | 'done' | 'error'
}

// The sortable columns in TrackTable, in their default order. User
// reordering (drag-and-drop) is persisted as a permutation of this list —
// see config.ts's getColumnOrder for how a stored order missing a column
// (e.g. one added in a later version) or containing an unknown one is
// reconciled back against this.
export type TrackTableColumnKey = 'title' | 'filename' | 'artist' | 'bpm' | 'musicalKey' | 'format' | 'duration'
export const DEFAULT_TRACK_TABLE_COLUMN_ORDER: readonly TrackTableColumnKey[] = [
  'title',
  'filename',
  'artist',
  'bpm',
  'musicalKey',
  'format',
  'duration',
]

export interface Genre {
  id: number
  name: string
}

export interface Subgenre {
  id: number
  name: string
  genreId: number
}

export interface Mood {
  id: number
  name: string
}

export interface BackupInfo {
  backupFolder: string
  lastBackupAt: string | null
  lastBackupError: string | null
}

export interface BackupEntry {
  timestamp: string
  dbPath: string
  configPath: string
}

export interface ImportResult {
  matchedTracks: number
  skippedTracks: number
}

export interface GenreDeletionSnapshot {
  genreName: string
  subgenres: { name: string }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]>
}

export type SirenMode = 'siren' | 'bomb' | 'gun' | 'laser'
export type SirenBeat = 'off' | 'slow' | 'medium' | 'fast'

// Option orders are load-bearing: scaleMidiValueToOption quantizes a CC
// value into an index against exactly these arrays, so a knob sweeps
// through them left-to-right in this order.
export const SIREN_MODES: readonly SirenMode[] = ['siren', 'bomb', 'gun', 'laser']
export const SIREN_BEATS: readonly SirenBeat[] = ['off', 'slow', 'medium', 'fast']

export interface SirenSettings {
  enabled: boolean
  mode: SirenMode
  pitchHz: number // 90..520 (base/starting frequency)
  speedHz: number // 0.5..12 (LFO rate — how fast the pitch wobbles up and down)
  depth: number // 0..2 (LFO depth multiplier — how wide the pitch swing stretches from pitchHz; 1 = each mode's stock depth)
  level: number // 0..1 (the siren's own output gain, independent of playerVolume)
  echoFeedback: number // 0..0.85
  beat: SirenBeat
}

// Defaults are the watchOS app's "Cisco Siren" default preset, with level
// added (the watch had no volume control), depth at 1 (each mode's stock
// LFO depth, unscaled — matches pre-depth-control behavior), and beat
// forced off.
export const DEFAULT_SIREN_SETTINGS: SirenSettings = {
  enabled: false,
  mode: 'siren',
  pitchHz: 350,
  speedHz: 6,
  depth: 1,
  level: 0.8,
  echoFeedback: 0.45,
  beat: 'off',
}

export interface EffectsSettings {
  delay: { enabled: boolean; timeMs: number; feedback: number; mix: number }
  reverb: { enabled: boolean; mix: number; decaySeconds: number; preDelayMs: number }
  // A single-knob sweep filter, Xone-mixer style: position is bipolar —
  // 0 is bypass (wide open), negative sweeps a low-pass filter closed
  // (cutting highs), positive sweeps a high-pass filter closed (cutting
  // lows). enabled is a hard global bypass on top of that (e.g. for a
  // MIDI-mapped on/off button) — disabled forces the filter fully open
  // regardless of position, without losing the dialed-in position.
  filter: { enabled: boolean; position: number; resonance: number }
  // Standard 3-band channel-strip EQ, dB gain per band (-12..+12, 0 flat).
  // enabled is a hard bypass on top, same convention as filter.enabled —
  // forces all three bands flat without losing the dialed-in gains.
  eq: { enabled: boolean; low: number; mid: number; high: number }
  siren: SirenSettings
}

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.3 },
  // decaySeconds/preDelayMs default to the previous fixed values (a 2s
  // synthetic impulse, no pre-delay), so existing configs/behavior are
  // unchanged until someone actually touches the new controls.
  reverb: { enabled: false, mix: 0.3, decaySeconds: 2, preDelayMs: 0 },
  filter: { enabled: true, position: 0, resonance: 1 },
  eq: { enabled: true, low: 0, mid: 0, high: 0 },
  siren: DEFAULT_SIREN_SETTINGS,
}

export type MidiControlKey =
  | 'volume'
  | 'delay.enabled'
  | 'delay.timeMs'
  | 'delay.feedback'
  | 'delay.mix'
  | 'reverb.enabled'
  | 'reverb.mix'
  | 'reverb.decaySeconds'
  | 'reverb.preDelayMs'
  | 'filter.enabled'
  | 'filter.position'
  | 'filter.resonance'
  | 'eq.enabled'
  | 'eq.low'
  | 'eq.mid'
  | 'eq.high'
  | 'siren.enabled'
  | 'siren.mode'
  | 'siren.pitchHz'
  | 'siren.speedHz'
  | 'siren.depth'
  | 'siren.level'
  | 'siren.echoFeedback'
  | 'siren.beat'
  | 'siren.trigger'
  | 'player.playPause'
  | 'player.playNext'

export interface MidiBinding {
  channel: number
  controller: number
  // Which status byte the binding was learned from — needed to send LED
  // feedback back to the device in the same message format it sent
  // (Control Change vs Note On/Off), since a CC message won't light an
  // LED bound via Note messages or vice versa. Optional so bindings saved
  // before this field existed still load without crashing.
  kind?: 'cc' | 'note'
}

export type MidiMappings = Partial<Record<MidiControlKey, MidiBinding>>
