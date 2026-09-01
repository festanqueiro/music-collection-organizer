export interface Track {
  id: number
  path: string
  filename: string
  folder: string
  format: string
  size: number
  mtime: number
  // Filesystem creation time (macOS APFS birthtime) — the closest available
  // proxy for "when this file was added to the drive"; null for rows
  // written before this column existed and never revisited by a scan.
  birthtime: number | null
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
export type TrackTableColumnKey =
  | 'title'
  | 'filename'
  | 'artist'
  | 'tags'
  | 'bpm'
  | 'musicalKey'
  | 'format'
  | 'duration'
  | 'dateAdded'
  | 'dateModified'
export const DEFAULT_TRACK_TABLE_COLUMN_ORDER: readonly TrackTableColumnKey[] = [
  'title',
  'filename',
  'artist',
  'tags',
  'bpm',
  'musicalKey',
  'format',
  'duration',
  'dateAdded',
  'dateModified',
]

export interface TrackTableSortState {
  key: TrackTableColumnKey
  direction: 'asc' | 'desc'
}

export interface Genre {
  id: number
  name: string
  // Hex color (e.g. "#3b82f6") set via the Tag Tree view's right-click
  // menu — null until the user picks one, in which case the UI falls back
  // to a default swatch. Shared by every subgenre under it (subgenres
  // don't have their own color).
  color: string | null
}

export interface Subgenre {
  id: number
  name: string
  genreId: number
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

export interface SubgenreDeletionSnapshot {
  subgenreName: string
  genreId: number
  trackSubgenreAssociations: { trackId: number }[]
}

export type SirenMode = 'siren' | 'bomb' | 'gun' | 'laser'
export type SirenBeat = 'off' | 'slow' | 'medium' | 'fast'

// Option orders are load-bearing: scaleMidiValueToOption quantizes a CC
// value into an index against exactly these arrays, so a knob sweeps
// through them left-to-right in this order.
export const SIREN_MODES: readonly SirenMode[] = ['siren', 'bomb', 'gun', 'laser']
export const SIREN_BEATS: readonly SirenBeat[] = ['off', 'slow', 'medium', 'fast']

// Standard delay-unit note divisions (straight, dotted, triplet), each
// expressed as a multiple of one beat (a quarter note) — matches how
// hardware/plugin delays with a "sync" mode let you dial in a musical
// division instead of raw milliseconds. Same load-bearing order caveat
// as SIREN_MODES/SIREN_BEATS above: a MIDI knob bound to delay.division
// sweeps through these in this order.
export const DELAY_DIVISIONS: readonly { label: string; beats: number }[] = [
  { label: '1/1', beats: 4 },
  { label: '1/2', beats: 2 },
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 },
  { label: '1/4.', beats: 1.5 },
  { label: '1/8.', beats: 0.75 },
  { label: '1/4T', beats: 2 / 3 },
  { label: '1/8T', beats: 1 / 3 },
]

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
  // Two independent, always-in-signal-path filter stages instead of one
  // knob swept across a bipolar range — the old single-knob "position"
  // design flipped one BiquadFilterNode between lowpass/highpass type as
  // it crossed the center, and that type switch caused an audible level
  // jump right at the crossover (the two filter types don't have
  // identical passband gain right at the boundary). lowpass/highpass are
  // each 0 (fully open, inaudible) .. 1 (fully closed) and never change
  // the node's type, so there's no crossover to click at. enabled is a
  // hard global bypass on top of both (e.g. a MIDI-mapped on/off button)
  // — disabled forces both fully open without losing the dialed-in
  // amounts. mix (0..1) blends the filtered signal back against the
  // pre-filter one, same dry/wet convention as delay.mix/reverb.mix/
  // eq.mix; 1 (fully wet) matches the filter's original always-fully-
  // applied behavior.
  filter: { enabled: boolean; lowpass: number; highpass: number; resonance: number; mix: number }
  // Standard 3-band channel-strip EQ, dB gain per band (-24..+24, 0 flat).
  // enabled is a hard bypass on top, same convention as filter.enabled —
  // forces all three bands flat without losing the dialed-in gains. mix
  // (0..1) blends the EQ'd signal back against the unprocessed one —
  // same dry/wet convention as delay.mix/reverb.mix — so the tonal shift
  // can be dialed in gradually instead of only ever being fully applied;
  // 1 (fully wet) matches the EQ's original always-fully-applied behavior.
  eq: { enabled: boolean; low: number; mid: number; high: number; mix: number }
  siren: SirenSettings
  // Global output gain applied at the very end of the chain, after every
  // FX send (delay/reverb wet, filter/EQ wet+dry) — unlike the footer
  // Player's Volume control (dryGain, right at the start of the chain,
  // pre-FX), pulling this down attenuates an already-ringing delay repeat
  // or reverb tail immediately, not just new signal entering them. Kept
  // out of the footer on purpose (a plain volume slider there would look
  // identical to Player Volume despite behaving very differently) — lives
  // in FxPanel as its own MIDI-mappable knob instead.
  masterVolume: number
}

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.3 },
  // decaySeconds/preDelayMs default to the previous fixed values (a 2s
  // synthetic impulse, no pre-delay), so existing configs/behavior are
  // unchanged until someone actually touches the new controls.
  reverb: { enabled: false, mix: 0.3, decaySeconds: 2, preDelayMs: 0 },
  filter: { enabled: true, lowpass: 0, highpass: 0, resonance: 1, mix: 1 },
  eq: { enabled: true, low: 0, mid: 0, high: 0, mix: 1 },
  siren: DEFAULT_SIREN_SETTINGS,
  masterVolume: 1,
}

export type MidiControlKey =
  | 'volume'
  | 'master.volume'
  | 'delay.enabled'
  | 'delay.timeMs'
  | 'delay.feedback'
  | 'delay.mix'
  | 'delay.division'
  | 'reverb.enabled'
  | 'reverb.mix'
  | 'reverb.decaySeconds'
  | 'reverb.preDelayMs'
  | 'filter.enabled'
  | 'filter.lowpass'
  | 'filter.highpass'
  | 'filter.resonance'
  | 'filter.mix'
  | 'eq.enabled'
  | 'eq.low'
  | 'eq.mid'
  | 'eq.high'
  | 'eq.mix'
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
