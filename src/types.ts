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
  reverb: { enabled: boolean; mix: number }
  siren: SirenSettings
}

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.3 },
  reverb: { enabled: false, mix: 0.3 },
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
