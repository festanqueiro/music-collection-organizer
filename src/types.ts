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
  // kbps; null until analysed (or when the file doesn't say)
  bitrate: number | null
  title: string | null
  artist: string | null
  album: string | null
  genreTag: string | null
  year: number | null
  bpm: number | null
  // Seconds to the first beat (the beat grid's start), from analysis; null
  // for tracks analysed before it existed.
  firstBeat: number | null
  // The start of the tune (seconds), set by the user: bar 0 of the beat
  // grid (docs/features/hot-cues.md, ADR 0059). Null until set — the grid
  // then starts at firstBeat, unconfirmed.
  gridStart: number | null
  // The BPM was set by the user (Refine BPM): analysis leaves it alone.
  bpmEdited?: boolean
  musicalKey: string | null
  // When it was last analysed (ms); the waveform is read per track
  // (tracks:getWaveform, ADR 0058) and read again when this changes.
  analyzedAt: number | null
  // Integrated loudness (LUFS) and a 1–10 energy rating, from analysis;
  // null until (re)analysed. See electron/main/analysis/energy.ts.
  loudness: number | null
  energy: number | null
  // Counted once a track has played for a while (see Player.tsx).
  playCount: number
  lastPlayedAt: number | null
  cloudStatus: 'local' | 'cloud_only'
  // Set only on tracks from the Missing Tracks filter: the file wasn't
  // found in the last scan (the row and its tags are kept).
  missing?: boolean
  analysisStatus: 'pending' | 'analyzing' | 'done' | 'error'
  // Why the last analysis failed, in plain words; null unless 'error'.
  analysisError: string | null
  // Whether the file's own tags have been read (title/artist… are then
  // what the file says, not just unknown).
  tagsRead: boolean
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
  | 'album'
  | 'tags'
  | 'subtags'
  | 'bpm'
  | 'musicalKey'
  | 'energy'
  | 'loudness'
  | 'gain'
  | 'cues'
  | 'format'
  | 'bitrate'
  | 'duration'
  | 'dateAdded'
  | 'dateModified'
export const DEFAULT_TRACK_TABLE_COLUMN_ORDER: readonly TrackTableColumnKey[] = [
  'title',
  'filename',
  'artist',
  'album',
  'tags',
  'subtags',
  'bpm',
  'musicalKey',
  'energy',
  'loudness',
  'gain',
  'cues',
  'format',
  'bitrate',
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
  // Its own colour, shown as the outline of its badges (genres' badges are
  // filled). New sub-genres get one automatically; null for none.
  color: string | null
}

// A playlist or a folder of them (docs/features/playlists.md). Siblings
// are ordered by position; trackCount is 0 for folders.
export interface PlaylistNode {
  id: number
  parentId: number | null
  kind: 'folder' | 'playlist'
  name: string
  position: number
  source: 'mco' | 'rekordbox'
  trackCount: number
}

// A song an import lists at a path that isn't in the collection, which
// looks like this collection song (`to`) — used only once confirmed.
export interface RekordboxRelink {
  from: string
  trackId: number
  to: string
  label: string
  reason: string
}

export interface RekordboxDuplicate {
  id: number
  // Where it is in MCO's Playlists box ("Sets / Sunday").
  name: string
  sameName: boolean
  // 'same': exactly the same songs; 'most': at least 80% shared.
  songs: 'same' | 'most' | 'different'
  shared: number
  mcoSongs: number
}

// Where an import's new playlists and folders go: the Rekordbox folder
// (made on the first import), the top level, a folder of the Playlists
// box, or a new folder at the top level.
export type RekordboxImportDestination =
  | { kind: 'rekordbox' }
  | { kind: 'top' }
  | { kind: 'folder'; id: number }
  | { kind: 'new'; name: string }

// What to do with an incoming playlist that MCO already seems to have.
export type RekordboxDuplicateAction = 'skip' | 'new' | 'update'

// What a Rekordbox import will do, shown before anything is written.
export interface RekordboxImportPlan {
  folders: number
  // matched: found by path; relinked: found elsewhere, to confirm.
  playlists: {
    // Its name path in Rekordbox's tree (JSON) — what an import decision refers to.
    key: string
    name: string
    songs: number
    matched: number
    relinked: number
    refresh: boolean
    // A playlist MCO already has with the same name or the same songs.
    duplicate: RekordboxDuplicate | null
  }[]
  songs: number
  matched: number
  relinks: RekordboxRelink[]
  // Imported playlists that aren't in this export any more (kept).
  gone: string[]
  // What else a collection export (xml) can bring, counted — null for
  // playlist files (m3u8, txt), which only hold playlists.
  extras?: RekordboxImportExtras | null
}

export interface RekordboxImportExtras {
  // Hot cues, memory cues and loops, for songs with no cues in MCO yet;
  // `skipped` songs already have cues in MCO.
  cues: { songs: number; cues: number; skipped: number }
  // Songs whose BPM is missing in MCO or differs from Rekordbox's.
  bpm: { songs: number }
}

// What the user ticked in the import's summary. Playlists only is what an
// import always did.
export interface RekordboxImportChoices {
  playlists: boolean
  cues: boolean
  bpm: boolean
}

export interface RekordboxImportResult {
  nodes: PlaylistNode[]
  cues: { songs: number; cues: number } | null
  bpm: { songs: number } | null
}

// A cue point on a track (docs/features/hot-cues.md): a hot cue A–H
// (slot 0–7), or a memory cue / loop (slot -1, from Rekordbox).
export interface TrackCue {
  id: number
  kind: 'hot' | 'memory' | 'loop'
  slot: number
  // Seconds from the start; `end` only for loops.
  start: number
  end: number | null
  // "#rrggbb", or null for the slot's default colour.
  color: string | null
  name: string
}

// Rekordbox sync, phase 1 (docs/features/rekordbox-sync.md): what differs
// between Rekordbox's collection export and MCO — read-only, nothing applied.
export type RekordboxInfoField = 'title' | 'artist' | 'album' | 'year' | 'genre' | 'bpm' | 'key'

export interface RekordboxCueMark {
  // 0–7 = hot cue A–H; -1 = memory cue.
  slot: number
  kind: 'hot' | 'memory' | 'loop'
  start: number
  end?: number
  // "#rrggbb", or null when Rekordbox gave none.
  color: string | null
}

export interface RekordboxReport {
  file: string
  rekordboxVersion: string | null
  rekordboxTracks: number
  // Rekordbox's songs found in MCO (by path).
  matched: number
  mcoTracks: number
  playlists: {
    kind: 'only-rekordbox' | 'only-mco' | 'different' | 'same'
    name: string
    rekordboxSongs: number | null
    mcoSongs: number | null
    onlyRekordbox: string[]
    onlyMco: string[]
    orderDiffers: boolean
    // Songs the Rekordbox playlist lists that aren't in MCO's collection.
    notInCollection: number
    // An imported playlist that isn't in Rekordbox's export any more.
    goneFromRekordbox: boolean
  }[]
  // Per field: how many songs differ, and the first rows.
  info: { field: RekordboxInfoField; count: number; rows: { trackId: number; song: string; rekordbox: string; mco: string }[] }[]
  // Cue points on songs both have, where they differ: only Rekordbox has
  // cues, only MCO has, or both but not the same (slot, time ±10 ms, colour).
  cues: {
    onlyRekordbox: number
    onlyMco: number
    different: number
    rows: {
      trackId: number
      song: string
      status: 'only-rekordbox' | 'only-mco' | 'different'
      rekordbox: RekordboxCueMark[]
      mco: RekordboxCueMark[]
    }[]
  }
  files: {
    kind: 'outside-collection' | 'not-scanned' | 'gone-from-disk' | 'only-in-mco' | 'missing-in-mco'
    count: number
    rows: { path: string; song: string }[]
  }[]
}

// Auto-updater state, pushed from main (electron/main/updater.ts).
//   disabled    — this build never updates itself (dev, BETA); see error
//   available   — latestVersion is newer; canInstall says whether this
//                 copy can replace itself (else installBlocker says why)
//   downloading — progress 0..1
//   installing  — verifying, then the app quits and relaunches
// An action picked in the application menu (electron/main/appMenu.ts).
export type MenuCommand =
  | 'settings'
  | 'check-for-updates'
  | 'new-playlist'
  | 'import-rekordbox'
  | 'export-rekordbox'
  | 'update-collection'
  | 'analyse-collection'
  | 'stop-analysis'
  | 'find'
  | 'play-pause'
  | 'next-track'
  | 'shuffle-queue'
  | 'clear-queue'
  | 'show-collection'
  | 'show-queue'
  | 'show-fx'
  | 'show-live'
  | 'show-visualizer'
  | 'stats'
  | 'toggle-sidebar'

export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'installing' | 'error'
  currentVersion: string
  latestVersion?: string
  checkedAt?: string
  canInstall?: boolean
  installBlocker?: string
  progress?: number
  error?: string
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
  genreColor: string | null
  subgenres: { name: string; color: string | null }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]>
}

export interface SubgenreDeletionSnapshot {
  subgenreName: string
  subgenreColor: string | null
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
  // pre-filter one, same dry/wet convention as delay.mix/reverb.mix;
  // 1 (fully wet) matches the filter's original always-fully-
  // applied behavior.
  filter: { enabled: boolean; lowpass: number; highpass: number; resonance: number; mix: number }
  // Standard 3-band channel-strip EQ, dB gain per band (-24..+24, 0 flat).
  // Always on and fully applied, like a mixer's channel EQ — no on/off or
  // mix (flat is the "off" position).
  eq: { low: number; mid: number; high: number }
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
  eq: { low: 0, mid: 0, high: 0 },
  siren: DEFAULT_SIREN_SETTINGS,
  masterVolume: 1,
}

// The mic (docs/features/recording.md): its voice chain and its own
// effects, separate from the track's EffectsSettings (which are also sent
// to the TV when casting). Saved, except that the mic always starts off.
export interface MicSettings {
  // The mic is open and live in the mix. Never restored on launch.
  enabled: boolean
  // Input device (null = the system default).
  deviceId: string | null
  // Chromium's (WebRTC) noise suppression on the input: takes out steady
  // background noise, at some cost to the voice. Changing it reopens the
  // mic. (macOS Voice Isolation isn't honoured by Chromium here.)
  noiseSuppression: boolean
  // Input gain, dB.
  gainDb: number
  // Noise gate threshold, dBFS; GATE_OFF_DB (the minimum) turns it off.
  gateDb: number
  // Compressor amount, 0 (off) .. 1 (heavy), with automatic make-up gain.
  compressor: number
  // 3-band EQ, dB (-12..+12), always on (flat = off).
  eq: { low: number; mid: number; high: number }
  // The mic's own echo. Throw (not a setting) sends into it while held,
  // even when it's off.
  echo: { enabled: boolean; timeMs: number; feedback: number; mix: number }
  reverb: { enabled: boolean; decaySeconds: number; mix: number }
  // Pitch shift, in semitones (-12..+12); mix 0..1 blends in the dry voice
  // (1 = only shifted).
  pitch: { enabled: boolean; semitones: number; mix: number }
  // Band-passed "telephone/megaphone" voice; drive 0..1 adds grit.
  radio: { enabled: boolean; drive: number }
  // Pulls the music down by amountDb while the mic is talking.
  duck: { enabled: boolean; amountDb: number }
  // Hear the mic through the speakers (feedback risk: use headphones).
  monitor: boolean
}

export const MIC_GATE_OFF_DB = -80

export const DEFAULT_MIC_SETTINGS: MicSettings = {
  enabled: false,
  deviceId: null,
  noiseSuppression: false,
  gainDb: 0,
  gateDb: -55,
  compressor: 0.4,
  eq: { low: 0, mid: 0, high: 0 },
  echo: { enabled: false, timeMs: 375, feedback: 0.45, mix: 0.5 },
  reverb: { enabled: false, decaySeconds: 1.5, mix: 0.3 },
  pitch: { enabled: false, semitones: -5, mix: 1 },
  radio: { enabled: false, drive: 0.3 },
  duck: { enabled: true, amountDb: 10 },
  monitor: false,
}

// Every MIDI-mappable control. A runtime list (not just a union type) so
// imported mapping files can be validated against it.
export const MIDI_CONTROL_KEYS = [
  'volume',
  'master.volume',
  'delay.enabled',
  'delay.timeMs',
  'delay.feedback',
  'delay.mix',
  'delay.division',
  'reverb.enabled',
  'reverb.mix',
  'reverb.decaySeconds',
  'reverb.preDelayMs',
  'filter.enabled',
  'filter.lowpass',
  'filter.highpass',
  'filter.resonance',
  'filter.mix',
  'eq.low',
  'eq.mid',
  'eq.high',
  'siren.enabled',
  'siren.mode',
  'siren.pitchHz',
  'siren.speedHz',
  'siren.depth',
  'siren.level',
  'siren.echoFeedback',
  'siren.beat',
  'siren.trigger',
  'player.playPause',
  'player.playNext',
  'player.cue',
  // Hot cue pads A–H (docs/features/hot-cues.md).
  'player.hotCue1',
  'player.hotCue2',
  'player.hotCue3',
  'player.hotCue4',
  'player.hotCue5',
  'player.hotCue6',
  'player.hotCue7',
  'player.hotCue8',
  'mic.enabled',
  'mic.talk',
  'mic.gainDb',
  'mic.gateDb',
  'mic.compressor',
  'mic.eq.low',
  'mic.eq.mid',
  'mic.eq.high',
  'mic.echo.enabled',
  'mic.echo.throw',
  'mic.echo.timeMs',
  'mic.echo.feedback',
  'mic.echo.mix',
  'mic.echo.division',
  'mic.reverb.enabled',
  'mic.reverb.decaySeconds',
  'mic.reverb.mix',
  'mic.pitch.enabled',
  'mic.pitch.semitones',
  'mic.pitch.mix',
  'mic.radio.enabled',
  'mic.radio.drive',
  'mic.duck.enabled',
  'mic.duck.amountDb',
] as const

export type MidiControlKey = (typeof MIDI_CONTROL_KEYS)[number]

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

// Result of reading a MIDI mappings file (Settings → MIDI →
// Import) — `skipped` names bindings that were dropped as unknown/invalid.
export type MidiImportResult = { mappings: MidiMappings; skipped: string[] } | { error: string }

// A Google Cast device (Chromecast, Google TV, Nest speaker) found on the
// LAN — see electron/main/cast/castDiscovery.ts.
// A display MCO can show the second screen on (Settings-free: from
// Electron's screen API, docs/features/second-screen.md).
export interface ScreenDisplay {
  id: number
  label: string
  internal: boolean
  width: number
  height: number
  // Refresh rate, Hz (0 when macOS doesn't say).
  hz: number
  // MCO's own window is on it.
  hasMainWindow: boolean
}

// Where the second screen shows: a display's id, or a window on the
// display MCO is on.
export type ScreenTarget = number | 'window'

export interface CastDevice {
  id: string
  name: string
  model: string | null
  host: string
  port: number
  // No screen (Nest/Home speakers, speaker groups) — gets an audio-only
  // stream instead of video.
  audioOnly: boolean
}

// Which app a cast session plays in (see electron/main/cast/castSession.ts):
// 'receiver' is MCO's own Cast app (cast-receiver/) — effects, siren and
// visualizer run on the device; 'direct' is Google's media player, the
// fallback where a device won't run MCO's app (tracks only).
export type CastMode = 'receiver' | 'direct'

// Direct mode: MCO's player → the device.
export type CastDirectCommand =
  | { type: 'load'; trackId: number; position: number; autoplay: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; position: number }

// Direct mode: what the device's player is doing, pushed from main.
export interface CastMediaEvent {
  trackId: number | null
  playerState: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'LOADING'
  idleReason: string | null
  currentTime: number
}

// Cast session state, pushed from main (electron/main/cast/castSession.ts).
//   connecting — reaching the device and starting its player
//   casting    — the device's player is up (mode says which app)
//   error      — the session ended because of `error`; otherwise idle
export interface CastStatus {
  state: 'idle' | 'connecting' | 'casting' | 'error'
  deviceName?: string
  // The device has no screen (gets audio only).
  audioOnly?: boolean
  mode?: CastMode
  error?: string
}

// The ID3 fields the user can edit (DetailPanel's ID3 tags). null or
// '' clears the field in the file.
export interface EditableTags {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
}

export type WriteTagsResult = { ok: true; track: Track } | { ok: false; error: string }

// Backup to an external disk (Settings → Backups & data; see
// electron/main/externalBackup.ts).
export interface ExternalBackupProgress {
  phase: 'scanning' | 'copying' | 'done' | 'cancelled' | 'error'
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  error?: string
}

export interface ExternalBackupResult {
  at: string
  copied: number
  unchanged: number
  // Only in the cloud (a Google Drive placeholder, etc.): not on this Mac
  // to copy, and copying would download it.
  skippedCloudOnly: number
  failed: number
  bytesCopied: number
}

export interface ExternalBackupInfo {
  folder: string | null
  // Why the chosen folder can't be used right now (e.g. the disk isn't
  // connected), or null.
  problem: string | null
  last: ExternalBackupResult | null
  running: boolean
}

// Record mode (docs/features/recording.md): the file format a recording is
// saved in, and what stopping one produced.
export type RecordingFormat = 'wav' | 'flac' | 'mp3'
export interface RecordingResult {
  // The saved file, or null if nothing was recorded.
  path: string | null
  error: string | null
}

// A detailed waveform of part of a track: `peaks[i]` covers the time
// start + i / perSecond (electron/main/waveformSection.ts).
export interface WaveformSection {
  start: number
  perSecond: number
  peaks: number[]
}

// "Convert to…" (docs/features/convert.md). Apple Lossless and AAC are
// both .m4a files.
export type ConvertFormat = 'wav' | 'aiff' | 'flac' | 'alac' | 'mp3' | 'aac'

export interface ConvertOptions {
  format: ConvertFormat
  // WAV, AIFF, FLAC, Apple Lossless; null = same as the file (deeper than 24 → 24).
  bitDepth: 16 | 24 | null
  // MP3 and AAC, in kbps.
  bitrate: number
  // In Hz; null = same as the file.
  sampleRate: number | null
  // Where the converted files go; null = next to each original.
  folder: string | null
  // The converted file takes the track's place and the original goes to
  // the Trash. Only next to the original.
  replace: boolean
}

// What a file's audio is, as ffmpeg reads it. A lossy file has no bit depth.
export interface AudioInfo {
  codec: string
  lossless: boolean
  bitDepth: number | null
  sampleRate: number | null
}

export interface ConvertResult {
  trackId: number
  // The original's file name.
  name: string
  status: 'converted' | 'skipped' | 'failed'
  path?: string
  replaced?: boolean
  // Why it was skipped or failed, or a warning about a converted one.
  message?: string
}

export interface ConvertProgress {
  done: number
  total: number
  // The file being converted now.
  name: string
}

// "Refine BPM" (docs/features/dj-tools.md): multiply the tempo (2, 0.5, or
// 1.5 when two thirds of it was detected), set it, or hand it back to
// analysis.
export type BpmChange = { kind: 'factor'; factor: number } | { kind: 'set'; bpm: number } | { kind: 'detect' }
