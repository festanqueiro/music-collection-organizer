// src/state/store.ts
import { create, type StoreApi } from 'zustand'
import type {
  Track,
  WaveformBands,
  WaveformStyle,
  BpmChange,
  TrackCue,
  PlaylistNode,
  RecordingFormat,
  MicSettings,
  EditableTags,
  Genre,
  Subgenre,
  ImportResult,
  GenreDeletionSnapshot,
  SubgenreDeletionSnapshot,
  EffectsSettings,
  MidiMappings,
  MidiControlKey,
  TrackTableColumnKey,
  TrackTableSortState,
  UpdateState,
  CastDevice,
  CastStatus,
  ScreenDisplay,
  ScreenTarget,
} from '../types'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_MIC_SETTINGS, DEFAULT_TRACK_TABLE_COLUMN_ORDER } from '../types'
import { sendMidiFeedback } from '../audio/midi'
import { MIC_TOGGLES, talkAfterRelease } from '../audio/micControls'
import type { TrackTagIds } from './tagFilter'

// 'unanalysed' includes tracks whose analysis failed.
export type AnalysedFilter = 'all' | 'analysed' | 'unanalysed'

export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping'
// MCO's own tags: 'no-tags' = no Tags at all (so no Subtags either);
// 'no-subtags' = no Subtag, whether or not it has Tags.
export type McoTagsFilter = 'all' | 'no-tags' | 'no-subtags'
import type { VisualizerThemeId } from 'threejs-visualisers'
import { isCastScreen, type AnyVisualizerThemeId, type CastScreen } from '../cast/tvVisualizers'
import type { KeyNotation } from './harmonic'
import { DEFAULT_APP_THEME, isAppThemeId, type AppThemeId } from '../appThemes'
import { describeLibraryChange } from './libraryChange'
import {
  playTrackNow as playTrackNowPure,
  addToPlaylist as addToPlaylistPure,
  addManyToPlaylist as addManyToPlaylistPure,
  playNext as playNextPure,
  removeFromPlaylist as removeFromPlaylistPure,
  movePlaylistItem as movePlaylistItemPure,
  advanceToNext as advanceToNextPure,
  shufflePlaylist as shufflePlaylistPure,
  clearUpcoming as clearUpcomingPure,
  playQueueItemNow as playQueueItemNowPure,
  playQueueItemNext as playQueueItemNextPure,
} from './playlist'
import { baseName } from '../paths'
import type { EnergyRange } from './trackFilters'
import { writeStored, readStoredFlag } from './stored'
import { createCueSlice } from './cueSlice'
import { createSavedPlaylistSlice } from './savedPlaylistSlice'
import { createMidiSlice } from './midiSlice'
import { createTagSlice } from './tagSlice'
import { downloadBeforePlaying, prefetchUpcoming, tracksNeedingAnalysis, triggerBackgroundAnalysis, triggerBackgroundAnalysisForMany } from './playbackHelpers'

// Debounced rather than saved on every slider tick — dragging a knob fires
// onChange continuously, and writing to electron-store on every tick would
// mean dozens of synchronous disk writes per second while dragging.
let effectsSettingsSaveTimeout: ReturnType<typeof setTimeout> | null = null
let micSettingsSaveTimeout: ReturnType<typeof setTimeout> | null = null
// When the Talk button went down, and whether the mic was live then (see
// micTalkDown/micTalkUp).
let talkPress: { at: number; wasLive: boolean } | null = null

// Backs showToast's auto-dismiss below.
let toastTimeout: ReturnType<typeof setTimeout> | null = null



// Applies a tag IPC call's returned (server-authoritative) TrackTagIds to one
// track's entry in the trackTags map, without reloading the whole collection
// — tag edits are frequent and loadAll() was re-fetching every
// track/genre/subgenre/mood/tag-id on every single edit. Using the server's
// answer (rather than recomputing it here) also avoids duplicating tags.ts's
// subgenre-cascade rule against a client-side cache that could be stale if
// two edits on the same track race.
function setTrackTags(
  set: StoreApi<CollectionState>['setState'],
  get: StoreApi<CollectionState>['getState'],
  updated: TrackTagIds
): void {
  const trackTags = new Map(get().trackTags)
  trackTags.set(updated.trackId, updated)
  set({ trackTags })
}

// Registered by the mounted Player (see playbackControls below).
export interface PlaybackControls {
  toggle: () => void
  cueDown: () => void
  cueUp: () => void
  // Hot cue pad `slot` (0–7): set it here if empty, else jump to it.
  hotCue: (slot: number) => void
}

export type PlayerScreen = 'queue' | 'fx' | 'live'

export interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  trackTags: Map<number, TrackTagIds>
  checkedTrackIds: Set<number>
  pendingGenreDeletion: { snapshot: GenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
  pendingSubgenreDeletion: { snapshot: SubgenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
  playlist: number[]
  continuousPlay: boolean
  // The full-screen view opened from the player bar's icons, if any.
  playerScreen: PlayerScreen | null
  playTrackNow: (trackId: number) => Promise<void>
  addToPlaylist: (trackId: number) => void
  // `analyse` (default true) also starts analysing any not-yet-analysed
  // queued tracks right away; false leaves each to be analysed when it's
  // loaded in the player.
  addManyToPlaylist: (trackIds: number[], options?: { analyse?: boolean }) => void
  // Bulk "add to queue" goes through a dialog (QueueDialog) that asks
  // whether to analyse everything now — unless there's nothing to decide
  // (all analysed and a small batch), in which case it queues directly.
  queueRequest: { trackIds: number[]; unanalysedCount: number } | null
  requestAddManyToQueue: (trackIds: number[]) => void
  resolveQueueRequest: (choice: 'analyse' | 'queue-only' | 'cancel') => void
  playNext: (trackId: number) => void
  removeFromPlaylist: (index: number) => void
  clearPlaylist: () => void
  movePlaylistItem: (fromIndex: number, toIndex: number) => void
  shufflePlaylist: () => void
  // Queue-view actions on an entry already in the queue (by index) — they
  // move the entry rather than copying it; see playlist.ts.
  playQueueItemNow: (index: number) => Promise<void>
  playQueueItemNext: (index: number) => void
  advanceToNext: () => Promise<void>
  setContinuousPlay: (value: boolean) => void
  // Opens that screen, or closes it if it's already the one open.
  togglePlayerScreen: (screen: PlayerScreen) => void
  setPlayerScreen: (screen: PlayerScreen | null) => void
  // Full-screen Visualizer overlay. Only the open/closed flag lives here —
  // the per-frame audio data is read straight from the AnalyserNode inside
  // the Visualizer's render loop (see audio/audioAnalysis.ts), since
  // pushing it through the store would re-render React ~60 times a second.
  visualizerOpen: boolean
  setVisualizerOpen: (open: boolean) => void
  // The visualizer theme on this Mac (a threejs-visualisers theme), and what
  // the TV shows while casting (picked in the Cast menu: the now-playing
  // screen or a TV-only theme, src/cast/tvVisualizers.ts).
  visualizerTheme: VisualizerThemeId
  setVisualizerTheme: (theme: VisualizerThemeId) => void
  castScreen: CastScreen
  setCastScreen: (screen: CastScreen) => void
  // Chosen value per theme option (see VisualizerTheme.options); an option
  // with no entry uses its first value.
  visualizerThemeOptions: Partial<Record<AnyVisualizerThemeId, Record<string, string>>>
  setVisualizerThemeOption: (theme: AnyVisualizerThemeId, optionId: string, valueId: string) => void
  // Track title/artist stays on screen in the Visualizer unless this
  // is switched on — unlike the theme picker/close controls, which fade
  // out whenever the mouse is idle.
  visualizerHideTrackInfo: boolean
  setVisualizerHideTrackInfo: (hide: boolean) => void
  // The Visualizer's frame-rate cap (picked from threejs-visualisers'
  // FPS_CHOICES); 0 is no cap, the display's refresh rate. Default 30.
  visualizerFps: number
  setVisualizerFps: (fps: number) => void
  // Visual delay (ms, 0..MAX_VISUAL_DELAY_MS): holds the visualizers back to
  // match sound that reaches the room late (AirPlay, Bluetooth). App.tsx
  // applies it to the audio engine's visual tap (ADR 0047).
  visualDelayMs: number
  setVisualDelayMs: (ms: number) => void
  // The second screen (docs/features/second-screen.md): where it's showing
  // (null = not showing; never restored on launch), what it shows (the
  // now-playing screen or a visualizer theme) and its track-info choice
  // (remembered), and the displays macOS offers.
  screenTarget: ScreenTarget | null
  setScreenTarget: (target: ScreenTarget | null) => void
  screenNowPlaying: boolean
  setScreenNowPlaying: (nowPlaying: boolean) => void
  screenTheme: VisualizerThemeId
  setScreenTheme: (theme: VisualizerThemeId) => void
  screenHideTrackInfo: boolean
  setScreenHideTrackInfo: (hide: boolean) => void
  screenDisplays: ScreenDisplay[]
  setScreenDisplays: (displays: ScreenDisplay[]) => void
  // Whether MIDI-learn badges are shown next to mappable controls
  // (Settings → MIDI). Purely visual — bindings keep working when hidden.
  showMidiControls: boolean
  setShowMidiControls: (show: boolean) => void
  playerLarge: boolean
  setPlayerLarge: (large: boolean) => void
  // How the Key column/detail panel/queue show keys (Settings → Appearance).
  keyNotation: KeyNotation
  setKeyNotation: (notation: KeyNotation) => void
  // The app's colour theme (Settings → Appearance); see src/appThemes.ts.
  appTheme: AppThemeId
  setAppTheme: (theme: AppThemeId) => void
  // Track-table filter: only tracks that mix harmonically (key) and in
  // tempo (BPM) with the playing track. Session-only, like the search box.
  compatibleFilter: boolean
  setCompatibleFilter: (on: boolean) => void
  // The sidebar's Filters view — also session-only, and combined with the
  // folder/tag selection and search.
  analysedFilter: AnalysedFilter
  setAnalysedFilter: (filter: AnalysedFilter) => void
  // A 1–10 energy range, or null for any.
  energyFilter: EnergyRange | null
  setEnergyFilter: (range: EnergyRange | null) => void
  duplicatesFilter: boolean
  setDuplicatesFilter: (on: boolean) => void
  mcoTagsFilter: McoTagsFilter
  setMcoTagsFilter: (filter: McoTagsFilter) => void
  // Tracks whose file has no artist or title (see missingMetadata.ts).
  missingMetadataFilter: boolean
  setMissingMetadataFilter: (on: boolean) => void
  // Tracks whose file the last scan couldn't find (hidden from `tracks`),
  // and the filter that lists them instead of the collection.
  missingTracks: Track[]
  missingTracksFilter: boolean
  setMissingTracksFilter: (on: boolean) => void
  // Tracks whose file is only in the cloud (not downloaded to this Mac).
  cloudOnlyFilter: boolean
  setCloudOnlyFilter: (on: boolean) => void
  // Files whose tags the background read hasn't reached yet (0 when done).
  tagReadRemaining: number
  setTagReadRemaining: (remaining: number) => void
  // Re-reads one track's tags from its file (the detail panel, on select).
  refreshTrackFileTags: (trackId: number) => Promise<void>
  // Imperative escape hatch so a MIDI-bound player.playPause control (and
  // eventually the spacebar/other external triggers) can toggle playback
  // without lifting the actual playing/paused boolean — which the <audio>
  // element itself owns — out of Player.tsx and into the store. Player
  // registers its toggle function on mount, clears it on unmount; null
  // when nothing is loaded, so a stray MIDI press with nothing playing is
  // silently a no-op instead of throwing.
  // cueDown/cueUp drive the CDJ-style CUE button (see Player.tsx) —
  // separate press and release, since holding CUE previews from the cue
  // point.
  playbackControls: PlaybackControls | null
  // Mirrors the loaded track's play/pause state (Player owns the <audio>
  // element) so the track table can show a pause icon on the playing row.
  playerPlaying: boolean
  setPlayerPlaying: (playing: boolean) => void
  // Casting to a Google Cast device — status/devices are pushed from main;
  // the session itself lives in src/cast/castSession.ts.
  castStatus: CastStatus
  setCastStatus: (status: CastStatus) => void
  castDevices: CastDevice[]
  setCastDevices: (devices: CastDevice[]) => void
  // Silences this Mac's speakers while the TV plays — the TV runs a few
  // seconds behind, so hearing both at once is an echo.
  castMuteLocal: boolean
  setCastMuteLocal: (mute: boolean) => void
  // Record mode (see audio/recordingSession.ts). Recording and casting
  // never run together.
  recordingState: RecordingState
  setRecordingState: (state: RecordingState) => void
  recordingFormat: RecordingFormat
  setRecordingFormat: (format: RecordingFormat) => void
  // The recording's level in dB (the Rec popover's Level knob; 0 = as
  // heard). App.tsx applies it to the audio engine.
  recordingLevelDb: number
  setRecordingLevelDb: (db: number) => void
  // The mic (audio/micSession.ts applies these to its chain).
  micSettings: MicSettings
  loadMicSettings: () => Promise<void>
  setMicSettings: (settings: MicSettings) => void
  // Talk: false while the mic is muted. Starts live each time it opens.
  micLive: boolean
  setMicLive: (live: boolean) => void
  // Talk as one button: a tap toggles live/muted, holding a muted mic
  // talks while held (see micControls.ts).
  micTalkDown: () => void
  micTalkUp: () => void
  // Throw: held, the voice goes into the mic's echo.
  micThrow: boolean
  setMicThrow: (held: boolean) => void
  // The last recording's file, for "Show in Finder" after stopping.
  lastRecordingPath: string | null
  setLastRecordingPath: (path: string | null) => void
  setPlaybackControls: (controls: PlaybackControls | null) => void
  // Same imperative-escape-hatch pattern as playbackControls above: the
  // Division knob's "recompute delay.timeMs from the current track's
  // BPM" action needs the currently-playing track, which FxPanel already
  // has (as its `track` prop) and the store doesn't. FxPanel registers
  // the callback on mount/track change; a MIDI-bound delay.division
  // knob calls it with the picked DELAY_DIVISIONS index so the on-screen
  // knob's position stays in sync with what MIDI just picked.
  delayDivisionSync: ((index: number) => void) | null
  setDelayDivisionSync: (sync: ((index: number) => void) | null) => void
  searchText: string
  collectionFolder: string | null
  analysisProgress: { done: number; total: number } | null
  modalOpen: boolean
  appVersion: string | null
  loadAppVersion: () => Promise<void>
  effectsSettings: EffectsSettings
  loadEffectsSettings: () => Promise<void>
  setEffectsSettings: (settings: EffectsSettings) => void
  playerVolume: number
  setPlayerVolume: (volume: number) => void
  // 0..1 fraction of the current track played — Player.tsx pushes this on
  // every timeupdate so the queue view (a sibling, not a descendant of
  // Player) can render a progress line under the currently-playing row.
  playbackProgress: number
  setPlaybackProgress: (progress: number) => void
  // Whether the dub siren's trigger is currently held down — shared here
  // (not local component state) since mouse, the hold-S key, and a bound
  // MIDI button all sound the trigger from three different places, and
  // the FX panel button's pressed styling should reflect all of them.
  sirenTriggered: boolean
  setSirenTriggered: (triggered: boolean) => void
  // Brief, auto-dismissing confirmation for a bulk action (batch tag,
  // folder-wide analyse/queue) that would otherwise give zero feedback —
  // a <select> snapping back to its placeholder or a context menu just
  // closing looks identical to the click not registering at all.
  toastMessage: string | null
  showToast: (message: string) => void
  // Playlists (docs/features/playlists.md) — named "playlistNodes"/"saved"
  // because `playlist` above is the queue. The selected playlist's songs,
  // in order, are what the table shows while it's selected.
  playlistNodes: PlaylistNode[]
  selectedPlaylistId: number | null
  selectedPlaylistTrackIds: number[]
  recentPlaylistIds: number[]
  loadPlaylists: () => Promise<void>
  selectPlaylist: (id: number | null) => Promise<void>
  createPlaylistNode: (kind: 'folder' | 'playlist', name: string, parentId: number | null) => Promise<number>
  renamePlaylistNode: (id: number, name: string) => Promise<void>
  deletePlaylistNode: (id: number) => Promise<void>
  addTracksToSavedPlaylist: (playlistId: number, trackIds: number[]) => Promise<void>
  // Cue points (docs/features/hot-cues.md), per track, loaded when needed;
  // the counts feed the table's Cues column.
  trackCues: Map<number, TrackCue[]>
  hotCueCounts: Record<number, number>
  loadTrackCues: (trackId: number) => Promise<TrackCue[]>
  // Whole-track waveforms, read per track when the player loads it (they're
  // not in `tracks`, ADR 0058).
  trackWaveforms: Map<number, number[]>
  // The same in bass, mids and highs, for the coloured waveform styles.
  trackWaveformBands: Map<number, WaveformBands>
  loadTrackWaveformBands: (trackId: number) => Promise<void>
  // How the player's waveform is drawn, and whether bar lines are on it
  // (Settings → Appearance).
  waveformStyle: WaveformStyle
  setWaveformStyle: (style: WaveformStyle) => void
  waveformGrid: boolean
  setWaveformGrid: (show: boolean) => void
  loadTrackWaveform: (trackId: number) => Promise<void>
  refreshHotCueCounts: () => Promise<void>
  setHotCue: (trackId: number, slot: number, start: number) => Promise<void>
  updateHotCue: (trackId: number, slot: number, changes: { color?: string | null; name?: string }) => Promise<void>
  deleteHotCue: (trackId: number, slot: number) => Promise<void>
  // Deletes a hot cue the user removed (the pad's ×, its menu): Undo puts
  // it back where it was, with its colour and name.
  removeHotCue: (trackId: number, slot: number) => Promise<void>
  cueUndo: { message: string; trackId: number; cue: TrackCue } | null
  undoCueRemove: () => Promise<void>
  dismissCueUndo: () => void
  // Removes songs from the playlist being viewed; Undo puts them back.
  removeTracksFromSelectedPlaylist: (trackIds: number[]) => Promise<void>
  // Drag-reorder in the playlist being viewed: `trackIds` land before or
  // after `targetId`, keeping their own order.
  moveTracksInSelectedPlaylist: (trackIds: number[], targetId: number, where: 'before' | 'after') => Promise<void>
  playlistUndo: { message: string; playlistId: number; previous: number[]; removed: number[] } | null
  undoPlaylistRemove: () => Promise<void>
  dismissPlaylistUndo: () => void
  // Replaces the queue with a playlist's (or a folder's) songs and plays
  // the first; the queue it replaced can be brought back for a while.
  playPlaylistNode: (id: number) => Promise<void>
  queueUndo: { message: string; previous: number[] } | null
  undoQueueReplace: () => void
  dismissQueueUndo: () => void
  midiMappings: MidiMappings
  midiLearningControl: MidiControlKey | null
  loadMidiMappings: () => Promise<void>
  columnOrder: TrackTableColumnKey[]
  loadColumnOrder: () => Promise<void>
  setColumnOrder: (order: TrackTableColumnKey[]) => void
  // Track list columns the user switched off (Title never is).
  hiddenColumns: TrackTableColumnKey[]
  loadHiddenColumns: () => Promise<void>
  setColumnVisible: (key: TrackTableColumnKey, visible: boolean) => void
  sortState: TrackTableSortState
  loadSortState: () => Promise<void>
  setSortState: (state: TrackTableSortState) => void
  // null = system default output device. Applied to both the current
  // Player's EffectsChain and the siren's own separate AudioContext —
  // see Player.tsx's and App.tsx's effects reacting to this.
  audioOutputDeviceId: string | null
  loadAudioOutputDeviceId: () => Promise<void>
  setAudioOutputDeviceId: (deviceId: string | null) => Promise<void>
  // Headphone pre-listen: a second, FX-free player on its own output
  // device (see CuePlayer.tsx), independent of the main player/queue.
  cueOutputDeviceId: string | null
  loadCueOutputDeviceId: () => Promise<void>
  setCueOutputDeviceId: (deviceId: string | null) => Promise<void>
  cueTrackId: number | null
  // Toggles: previewing the track already in the cue player stops it.
  previewTrack: (trackId: number) => void
  stopPreview: () => void
  cueVolume: number
  setCueVolume: (volume: number) => void
  // Auto-updater (electron/main/updater.ts) — state is pushed from main.
  updateState: UpdateState | null
  setUpdateState: (state: UpdateState) => void
  loadUpdateState: () => Promise<void>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  // "Later" on the banner: hides it for that version until next launch.
  dismissedUpdateVersion: string | null
  dismissUpdate: () => void
  autoCheckUpdates: boolean
  setAutoCheckUpdates: (enabled: boolean) => Promise<void>
  // Folder watcher (electron/main/folderWatcher.ts) settings, and what to
  // do when a background rescan it triggered finds changes.
  watchCollectionFolder: boolean
  autoAnalyseNewTracks: boolean
  loadLibrarySettings: () => Promise<void>
  setWatchCollectionFolder: (enabled: boolean) => Promise<void>
  setAutoAnalyseNewTracks: (enabled: boolean) => Promise<void>
  handleLibraryChanged: (result: { inserted: number; updated: number; missing: number }) => Promise<void>
  startMidiLearn: (control: MidiControlKey) => void
  cancelMidiLearn: () => void
  clearMidiMapping: (control: MidiControlKey) => void
  // Removes every binding at once (Settings → MIDI, behind a
  // confirmation) and cancels any in-progress learn.
  resetMidiMappings: () => void
  // Replaces every binding with an imported set (Settings → MIDI →
  // Import, after the file's been read and validated in main).
  replaceMidiMappings: (mappings: MidiMappings) => void
  handleMidiControlChange: (channel: number, controller: number, value: number, kind: 'cc' | 'note') => void
  loadCollectionFolder: () => Promise<void>
  pickCollectionFolder: () => Promise<boolean>
  loadAll: () => Promise<void>
  setAnalysisProgress: (progress: { done: number; total: number } | null) => void
  setModalOpen: (open: boolean) => void
  refreshTracks: () => Promise<void>
  setTrackGenres: (trackId: number, genreIds: number[]) => Promise<void>
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) => Promise<void>
  setSearchText: (text: string) => void
  // analyseNew: also analyse the tracks this scan added.
  // removeMissing: also delete tracks whose file is gone, with their tags
  // (Update Collection only — ADR 0040).
  runScan: (opts?: { analyseNew?: boolean; removeMissing?: boolean }) => Promise<void>
  runAnalysis: (trackIds?: number[]) => Promise<void>
  // The start of the tune — bar 0 of the beat grid — or null to clear it.
  setTrackGridStart: (trackId: number, start: number | null) => Promise<void>
  // Refine BPM: doubles, halves, multiplies by 1.5 or sets the tempo of
  // these tracks — or, with 'detect', hands it back to analysis and
  // analyses them again.
  changeTracksBpm: (trackIds: number[], change: BpmChange) => Promise<void>
  // One play of a track (see Player.tsx): bumps its play count.
  recordPlay: (trackId: number) => Promise<void>
  // Moves a track's file to the Trash and drops it from the collection,
  // queue and selection; returns an error message, or null.
  trashTrack: (trackId: number) => Promise<string | null>
  // Moves tracks' files into another collection folder, after asking (rows
  // dropped on a folder in the Folders view). The loaded and pre-listened
  // tracks are left out: they're being read from their current path.
  moveTracksToFolder: (trackIds: number[], folder: string) => Promise<void>
  // Writes the ID3 fields into the file; returns an error message, or null.
  writeTrackTags: (trackId: number, tags: EditableTags) => Promise<string | null>
  stopAnalysis: () => Promise<void>
  createGenre: (name: string) => Promise<void>
  createSubgenre: (name: string, genreId: number) => Promise<void>
  renameGenre: (genreId: number, name: string) => Promise<void>
  renameSubgenre: (subgenreId: number, name: string) => Promise<void>
  setGenreColor: (genreId: number, color: string | null) => Promise<void>
  setSubgenreColor: (subgenreId: number, color: string | null) => Promise<void>
  deleteGenre: (genreId: number) => Promise<void>
  undoGenreDeletion: () => Promise<void>
  dismissGenreDeletionUndo: () => void
  deleteSubgenre: (subgenreId: number) => Promise<void>
  undoSubgenreDeletion: () => Promise<void>
  dismissSubgenreDeletionUndo: () => void
  toggleTrackChecked: (trackId: number) => void
  setTracksChecked: (trackIds: number[], checked: boolean) => void
  clearCheckedTracks: () => void
  addTagsToCheckedTracks: (tagIds: { genreIds: number[]; subgenreIds: number[] }) => Promise<void>
  exportTagData: () => Promise<{ path: string } | null>
  importTagData: () => Promise<ImportResult | null>
}

// A purely cosmetic renderer-side preference, so plain localStorage
// (per-app userData, like everything else) rather than an electron-store
// IPC round-trip.
const VISUALIZER_THEME_KEY = 'visualizerTheme'
// A Record so tsc fails when threejs-visualisers adds a theme that's missing
// here (a saved pick of it would otherwise fall back to Nebula on restart).
// Kept as literals rather than read from VISUALIZER_THEMES so the store
// doesn't pull three.js in.
const VISUALIZER_THEME_ID_SET: Record<VisualizerThemeId, true> = {
  nebula: true, warp: true, horizon: true, soundsystem: true, smoke: true,
  kaleidoscope: true, paint: true, liquid: true, origins: true,
}
const VISUALIZER_THEME_IDS = Object.keys(VISUALIZER_THEME_ID_SET) as VisualizerThemeId[]
const CAST_SCREEN_KEY = 'castScreen'
function loadCastScreen(): CastScreen {
  try {
    const stored = localStorage.getItem(CAST_SCREEN_KEY)
    if (stored && isCastScreen(stored)) return stored
  } catch {
    // localStorage unavailable (e.g. under Vitest's node environment).
  }
  return 'now-playing'
}
function loadVisualizerTheme(): VisualizerThemeId {
  try {
    const stored = localStorage.getItem(VISUALIZER_THEME_KEY)
    if (stored && (VISUALIZER_THEME_IDS as string[]).includes(stored)) {
      return stored as VisualizerThemeId
    }
  } catch {
    // localStorage unavailable (e.g. under Vitest's node environment).
  }
  return 'nebula'
}

const VISUALIZER_THEME_OPTIONS_KEY = 'visualizerThemeOptions'
// Before options, a theme had a single "variant" — Sound System's colour
// scheme — stored per theme under this key; read once as a fallback.
const LEGACY_VISUALIZER_THEME_VARIANTS_KEY = 'visualizerThemeVariants'
function loadVisualizerThemeOptions(): Partial<Record<AnyVisualizerThemeId, Record<string, string>>> {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  try {
    const stored = localStorage.getItem(VISUALIZER_THEME_OPTIONS_KEY)
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored)
      if (!isRecord(parsed)) return {}
      // Unknown ids are harmless — the Visualizer falls back to each
      // option's first value — so only the shape is checked here.
      return Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
          .map(([theme, values]) => [theme, Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'string'))]),
      ) as Partial<Record<AnyVisualizerThemeId, Record<string, string>>>
    }
    const legacy: unknown = JSON.parse(localStorage.getItem(LEGACY_VISUALIZER_THEME_VARIANTS_KEY) ?? '{}')
    if (!isRecord(legacy)) return {}
    return Object.fromEntries(
      Object.entries(legacy)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([theme, variant]) => [theme, { colours: variant }]),
    ) as Partial<Record<AnyVisualizerThemeId, Record<string, string>>>
  } catch {
    return {}
  }
}

const VISUALIZER_HIDE_TRACK_INFO_KEY = 'visualizerHideTrackInfo'
const loadVisualizerHideTrackInfo = (): boolean => readStoredFlag(VISUALIZER_HIDE_TRACK_INFO_KEY, false)

const VISUAL_DELAY_KEY = 'visualDelayMs'
export const MAX_VISUAL_DELAY_MS = 3000
function loadVisualDelayMs(): number {
  try {
    const value = Number(localStorage.getItem(VISUAL_DELAY_KEY) ?? 0)
    return Number.isFinite(value) ? Math.min(MAX_VISUAL_DELAY_MS, Math.max(0, Math.round(value))) : 0
  } catch {
    return 0
  }
}
const SCREEN_THEME_KEY = 'screenTheme'
function loadScreenTheme(): VisualizerThemeId {
  try {
    const stored = localStorage.getItem(SCREEN_THEME_KEY)
    if (stored && (VISUALIZER_THEME_IDS as string[]).includes(stored)) return stored as VisualizerThemeId
  } catch {
    // localStorage unavailable (e.g. under Vitest's node environment).
  }
  return loadVisualizerTheme()
}
const SCREEN_HIDE_TRACK_INFO_KEY = 'screenHideTrackInfo'
const SCREEN_NOW_PLAYING_KEY = 'screenNowPlaying'

const VISUALIZER_FPS_KEY = 'visualizerFps'
const DEFAULT_VISUALIZER_FPS = 30
function loadVisualizerFps(): number {
  try {
    const stored = localStorage.getItem(VISUALIZER_FPS_KEY)
    const fps = stored === null ? NaN : Number(stored)
    return Number.isInteger(fps) && fps >= 0 && fps <= 240 ? fps : DEFAULT_VISUALIZER_FPS
  } catch {
    return DEFAULT_VISUALIZER_FPS
  }
}

const CAST_MUTE_LOCAL_KEY = 'castMuteLocal'
const RECORDING_FORMAT_KEY = 'recordingFormat'
function loadRecordingFormat(): RecordingFormat {
  try {
    const value = localStorage.getItem(RECORDING_FORMAT_KEY)
    return value === 'flac' || value === 'mp3' ? value : 'wav'
  } catch {
    return 'wav'
  }
}
const RECORDING_LEVEL_KEY = 'recordingLevelDb'
export const RECORDING_LEVEL_MIN_DB = -24
export const RECORDING_LEVEL_MAX_DB = 6
function loadRecordingLevelDb(): number {
  try {
    const value = Number(localStorage.getItem(RECORDING_LEVEL_KEY) ?? 0)
    return Number.isFinite(value) ? Math.min(RECORDING_LEVEL_MAX_DB, Math.max(RECORDING_LEVEL_MIN_DB, value)) : 0
  } catch {
    return 0
  }
}
function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
function saveBooleanPreference(key: string, value: boolean): void {
  writeStored(key, String(value))
}

const SHOW_MIDI_CONTROLS_KEY = 'showMidiControls'
const loadShowMidiControls = (): boolean => readStoredFlag(SHOW_MIDI_CONTROLS_KEY, true)

// The player at twice its height, all of it for the waveform. A
// per-computer view preference.
const PLAYER_LARGE_KEY = 'playerLarge'
const loadPlayerLarge = (): boolean => readStoredFlag(PLAYER_LARGE_KEY, false)

const CUE_VOLUME_KEY = 'cueVolume'
function loadCueVolume(): number {
  try {
    const stored = Number(localStorage.getItem(CUE_VOLUME_KEY))
    return localStorage.getItem(CUE_VOLUME_KEY) !== null && stored >= 0 && stored <= 1 ? stored : 0.8
  } catch {
    return 0.8
  }
}

// The saved theme comes from main via the preload (already applied to
// <html> by it); undefined under Vitest, which has no preload.
function loadAppTheme(): AppThemeId {
  const initial = typeof window !== 'undefined' ? window.api?.initialAppTheme : undefined
  return isAppThemeId(initial) ? initial : DEFAULT_APP_THEME
}

function applyAppTheme(theme: AppThemeId): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

const KEY_NOTATION_KEY = 'keyNotation'
function loadKeyNotation(): KeyNotation {
  try {
    const stored = localStorage.getItem(KEY_NOTATION_KEY)
    return stored === 'camelot' || stored === 'musical' || stored === 'both' ? stored : 'both'
  } catch {
    return 'both'
  }
}

// Queuing more than this many tracks in one click always goes through
// the confirmation dialog, even when there's no analysis choice to make —
// with no folder/tag filter active, "Add all to queue" is the entire
// collection, and there's no undo for a mis-click that size.
const BULK_QUEUE_CONFIRM_THRESHOLD = 50

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  genres: [],
  subgenres: [],
  trackTags: new Map(),
  checkedTrackIds: new Set(),
  pendingGenreDeletion: null,
  pendingSubgenreDeletion: null,
  playlist: [],
  continuousPlay: true,
  playerScreen: null,
  queueRequest: null,
  visualizerOpen: false,
  visualizerTheme: loadVisualizerTheme(),
  castScreen: loadCastScreen(),
  visualizerHideTrackInfo: loadVisualizerHideTrackInfo(),
  visualizerFps: loadVisualizerFps(),
  visualDelayMs: loadVisualDelayMs(),
  screenTarget: null,
  screenNowPlaying: loadBooleanPreference(SCREEN_NOW_PLAYING_KEY, false),
  screenTheme: loadScreenTheme(),
  screenHideTrackInfo: loadBooleanPreference(SCREEN_HIDE_TRACK_INFO_KEY, false),
  screenDisplays: [],
  visualizerThemeOptions: loadVisualizerThemeOptions(),
  showMidiControls: loadShowMidiControls(),
  playerLarge: loadPlayerLarge(),
  keyNotation: loadKeyNotation(),
  appTheme: loadAppTheme(),
  compatibleFilter: false,
  analysedFilter: 'all',
  energyFilter: null,
  duplicatesFilter: false,
  missingMetadataFilter: false,
  missingTracks: [],
  missingTracksFilter: false,
  cloudOnlyFilter: false,
  mcoTagsFilter: 'all',
  tagReadRemaining: 0,
  searchText: '',
  collectionFolder: null,
  analysisProgress: null,
  modalOpen: false,
  appVersion: null,
  effectsSettings: DEFAULT_EFFECTS_SETTINGS,
  playerVolume: 1,
  playbackProgress: 0,
  sirenTriggered: false,
  toastMessage: null,
  playbackControls: null,
  playerPlaying: false,
  castStatus: { state: 'idle' },
  castDevices: [],
  castMuteLocal: loadBooleanPreference(CAST_MUTE_LOCAL_KEY, true),
  recordingState: 'idle',
  recordingFormat: loadRecordingFormat(),
  recordingLevelDb: loadRecordingLevelDb(),
  lastRecordingPath: null,
  micSettings: DEFAULT_MIC_SETTINGS,
  micLive: true,
  micThrow: false,
  delayDivisionSync: null,
  midiMappings: {},
  columnOrder: [...DEFAULT_TRACK_TABLE_COLUMN_ORDER],
  hiddenColumns: [],
  sortState: { key: 'title', direction: 'asc' },
  audioOutputDeviceId: null,
  cueOutputDeviceId: null,
  cueTrackId: null,
  cueVolume: loadCueVolume(),
  updateState: null,
  dismissedUpdateVersion: null,
  autoCheckUpdates: true,
  watchCollectionFolder: true,
  autoAnalyseNewTracks: false,
  midiLearningControl: null,

  loadEffectsSettings: async () => {
    const settings = await window.api.getEffectsSettings()
    // Never resume auto-firing a siren on launch, whatever was persisted.
    set({ effectsSettings: { ...settings, siren: { ...settings.siren, beat: 'off' } } })
  },

  setEffectsSettings: (settings) => {
    // Single choke point for every *.enabled change, whichever triggered
    // it (an FxPanel toggle switch or a MIDI toggle) — so a bound
    // button's LED always mirrors the app's actual enabled state, not
    // just the state changes that happened to originate from MIDI.
    const previous = get().effectsSettings
    const mappings = get().midiMappings
    const enabledPairs: [MidiControlKey, boolean, boolean][] = [
      ['delay.enabled', settings.delay.enabled, previous.delay.enabled],
      ['reverb.enabled', settings.reverb.enabled, previous.reverb.enabled],
      ['filter.enabled', settings.filter.enabled, previous.filter.enabled],
      ['siren.enabled', settings.siren.enabled, previous.siren.enabled],
    ]
    for (const [control, next, prev] of enabledPairs) {
      const binding = mappings[control]
      if (next !== prev && binding) sendMidiFeedback(binding, next)
    }

    set({ effectsSettings: settings })
    if (effectsSettingsSaveTimeout) clearTimeout(effectsSettingsSaveTimeout)
    effectsSettingsSaveTimeout = setTimeout(() => {
      window.api.setEffectsSettings(settings).catch((err) => console.error('failed to save effects settings', err))
    }, 300)
  },

  setPlayerVolume: (volume) => set({ playerVolume: volume }),

  setPlaybackProgress: (progress) => set({ playbackProgress: progress }),

  setSirenTriggered: (triggered) => set({ sirenTriggered: triggered }),

  showToast: (message) => {
    if (toastTimeout) clearTimeout(toastTimeout)
    set({ toastMessage: message })
    toastTimeout = setTimeout(() => set({ toastMessage: null }), 3000)
  },

  ...createCueSlice(set, get),
  ...createSavedPlaylistSlice(set, get),

  setPlaybackControls: (controls) => set({ playbackControls: controls }),
  setPlayerPlaying: (playing) => set({ playerPlaying: playing }),
  setCastStatus: (status) => set({ castStatus: status }),
  setCastDevices: (devices) => set({ castDevices: devices }),
  setCastMuteLocal: (mute) => {
    set({ castMuteLocal: mute })
    saveBooleanPreference(CAST_MUTE_LOCAL_KEY, mute)
  },
  setRecordingState: (state) => set({ recordingState: state }),
  setRecordingFormat: (format) => {
    set({ recordingFormat: format })
    writeStored(RECORDING_FORMAT_KEY, format)
  },
  setRecordingLevelDb: (db) => {
    set({ recordingLevelDb: db })
    writeStored(RECORDING_LEVEL_KEY, String(db))
  },
  setLastRecordingPath: (path) => set({ lastRecordingPath: path }),

  loadMicSettings: async () => {
    set({ micSettings: await window.api.getMicSettings() })
  },

  setMicSettings: (settings) => {
    // Same LED mirroring as setEffectsSettings, for the mic's toggles.
    const previous = get().micSettings
    const mappings = get().midiMappings
    for (const [control, toggle] of Object.entries(MIC_TOGGLES) as [MidiControlKey, NonNullable<(typeof MIC_TOGGLES)[MidiControlKey]>][]) {
      const binding = mappings[control]
      if (binding && toggle.get(settings) !== toggle.get(previous)) sendMidiFeedback(binding, toggle.get(settings))
    }
    // Opening the mic starts it live.
    if (settings.enabled && !previous.enabled) get().setMicLive(true)
    set({ micSettings: settings })
    if (micSettingsSaveTimeout) clearTimeout(micSettingsSaveTimeout)
    micSettingsSaveTimeout = setTimeout(() => {
      window.api.setMicSettings(settings).catch((err) => console.error('failed to save mic settings', err))
    }, 300)
  },

  setMicLive: (live) => {
    set({ micLive: live })
    const binding = get().midiMappings['mic.talk']
    if (binding) sendMidiFeedback(binding, live)
  },

  micTalkDown: () => {
    const wasLive = get().micLive
    talkPress = { at: Date.now(), wasLive }
    if (!wasLive) get().setMicLive(true)
  },

  micTalkUp: () => {
    if (!talkPress) return
    const { at, wasLive } = talkPress
    talkPress = null
    get().setMicLive(talkAfterRelease(wasLive, Date.now() - at))
  },

  setMicThrow: (held) => set({ micThrow: held }),
  setDelayDivisionSync: (sync) => set({ delayDivisionSync: sync }),

  loadMidiMappings: async () => {
    const mappings = await window.api.getMidiMappings()
    set({ midiMappings: mappings })
  },

  loadColumnOrder: async () => {
    const order = await window.api.getColumnOrder()
    set({ columnOrder: order })
  },

  setColumnOrder: (order) => {
    set({ columnOrder: order })
    window.api.setColumnOrder(order).catch((err) => console.error('failed to save column order', err))
  },

  loadHiddenColumns: async () => {
    const keys = await window.api.getHiddenColumns()
    set({ hiddenColumns: keys })
  },

  setColumnVisible: (key, visible) => {
    if (key === 'title') return
    const hidden = get().hiddenColumns.filter((k) => k !== key)
    if (!visible) hidden.push(key)
    set({ hiddenColumns: hidden })
    window.api.setHiddenColumns(hidden).catch((err) => console.error('failed to save hidden columns', err))
  },

  loadSortState: async () => {
    const state = await window.api.getSortState()
    set({ sortState: state })
  },

  setSortState: (state) => {
    set({ sortState: state })
    window.api.setSortState(state).catch((err) => console.error('failed to save sort state', err))
  },

  loadAudioOutputDeviceId: async () => {
    const deviceId = await window.api.getAudioOutputDeviceId()
    set({ audioOutputDeviceId: deviceId })
  },

  loadLibrarySettings: async () => {
    set(await window.api.getLibrarySettings())
  },

  setWatchCollectionFolder: async (enabled) => {
    set({ watchCollectionFolder: enabled })
    await window.api.setWatchCollectionFolder(enabled)
  },

  setAutoAnalyseNewTracks: async (enabled) => {
    set({ autoAnalyseNewTracks: enabled })
    await window.api.setAutoAnalyseNewTracks(enabled)
  },

  handleLibraryChanged: async (result) => {
    await get().loadAll()
    const summary = describeLibraryChange(result)
    const analyse = get().autoAnalyseNewTracks && result.inserted + result.updated > 0
    if (summary) get().showToast(analyse ? `${summary} — analysing` : summary)
    // A plain analysis:run covers every pending (new/changed) track.
    if (analyse) await get().runAnalysis()
  },

  setUpdateState: (state) => set({ updateState: state }),

  loadUpdateState: async () => {
    const [state, autoCheckUpdates] = await Promise.all([
      window.api.getUpdateState(),
      window.api.getAutoCheckUpdates(),
    ])
    set({ updateState: state, autoCheckUpdates })
  },

  checkForUpdates: async () => {
    set({ dismissedUpdateVersion: null })
    set({ updateState: await window.api.checkForUpdates() })
  },

  installUpdate: async () => {
    await window.api.installUpdate()
  },

  dismissUpdate: () => set({ dismissedUpdateVersion: get().updateState?.latestVersion ?? null }),

  setAutoCheckUpdates: async (enabled) => {
    set({ autoCheckUpdates: enabled })
    await window.api.setAutoCheckUpdates(enabled)
  },

  loadCueOutputDeviceId: async () => {
    set({ cueOutputDeviceId: await window.api.getCueOutputDeviceId() })
  },

  setCueOutputDeviceId: async (deviceId) => {
    set({ cueOutputDeviceId: deviceId })
    await window.api.setCueOutputDeviceId(deviceId)
  },

  previewTrack: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    // A cloud-only placeholder has nothing local to stream yet.
    if (!track || track.cloudStatus === 'cloud_only') return
    set({ cueTrackId: get().cueTrackId === trackId ? null : trackId })
  },

  stopPreview: () => set({ cueTrackId: null }),

  setCueVolume: (volume) => {
    set({ cueVolume: volume })
    writeStored(CUE_VOLUME_KEY, String(volume))
  },

  setAudioOutputDeviceId: async (deviceId) => {
    set({ audioOutputDeviceId: deviceId })
    await window.api.setAudioOutputDeviceId(deviceId)
  },

  ...createMidiSlice(set, get),

  loadCollectionFolder: async () => {
    const folder = await window.api.getCollectionFolder()
    set({ collectionFolder: folder })
  },

  pickCollectionFolder: async () => {
    // A first-ever collection folder pick (no data folder configured yet)
    // also relocates the DB + settings into it and restarts the app —
    // without this check, that would happen with zero warning right after
    // the OS folder picker closes, and look like the app crashed.
    if (await window.api.willRelocateOnNextCollectionFolderPick()) {
      const proceed = window.confirm(
        'This is your first time setting a collection folder — the database and settings will move inside it, and the app will restart. Continue?'
      )
      if (!proceed) return false
    }
    const folder = await window.api.chooseCollectionFolder()
    if (!folder) return false
    set({ collectionFolder: folder })
    // Without this, switching folders leaves the previous folder's tracks
    // showing (and unplayable, since media:// is scoped to the new folder)
    // until the user happens to trigger a scan some other way. This can
    // reject (e.g. main's scanInProgress guard, if a previous scan's
    // background analysis is still running) — the folder was still
    // successfully changed, so don't let that turn into an unhandled
    // rejection or stop the caller from treating the pick as successful.
    try {
      await get().runScan()
      // Analysis is a separate, explicit step (never automatic) — but
      // right after picking a brand-new folder, the whole collection is
      // unanalyzed, so it's worth asking once rather than making the user
      // discover the separate "Analyse Collection" button on their own.
      const hasUnanalyzed = get().tracks.some(
        (t) => t.analysisStatus === 'pending' || t.analysisStatus === 'error'
      )
      if (hasUnanalyzed && window.confirm('Do you want to analyse all tracks?')) {
        await get().runAnalysis()
      }
    } catch (err) {
      console.error('scan after folder change failed', err)
    }
    return true
  },

  loadAll: async () => {
    const [tracks, genres, subgenres, tagIdRows, missingTracks, playlistNodes, hotCueCounts] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getAllTagIds(),
      window.api.getMissingTracks(),
      // Counts change when a scan or a delete removes tracks.
      window.api.getPlaylistNodes(),
      window.api.getHotCueCounts(),
    ])
    const trackTags = new Map(tagIdRows.map((r) => [r.trackId, r]))
    // Keeps the batch selection across a reload (creating/renaming/
    // recolouring/deleting a tag, an import, a download all go through
    // here, often mid-way through batch tagging) — only dropping tracks
    // that no longer exist, e.g. after a rescan marked them missing.
    const trackIds = new Set(tracks.map((t) => t.id))
    const checkedTrackIds = new Set([...get().checkedTrackIds].filter((id) => trackIds.has(id)))
    set({ tracks, genres, subgenres, trackTags, checkedTrackIds, missingTracks, playlistNodes, hotCueCounts, trackCues: new Map() })
    const playlistId = get().selectedPlaylistId
    if (playlistId !== null) await get().selectPlaylist(playlistNodes.some((n) => n.id === playlistId) ? playlistId : null)
  },

  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  setModalOpen: (open) => set({ modalOpen: open }),

  // Deliberately separate from row selection (which only drives
  // DetailPanel) — the player is independent, so browsing/checking
  // details on other tracks doesn't interrupt whatever's currently
  // loaded and playing. Only these explicit actions change it.
  playTrackNow: async (trackId) => {
    if (!(await downloadBeforePlaying(get, trackId))) return
    set({ playlist: playTrackNowPure(get().playlist, trackId) })
    triggerBackgroundAnalysis(get, trackId)
    prefetchUpcoming(get)
  },

  addToPlaylist: (trackId) => {
    set({ playlist: addToPlaylistPure(get().playlist, trackId) })
    triggerBackgroundAnalysis(get, trackId)
    prefetchUpcoming(get)
  },

  addManyToPlaylist: (trackIds, options) => {
    set({ playlist: addManyToPlaylistPure(get().playlist, trackIds) })
    if (options?.analyse ?? true) triggerBackgroundAnalysisForMany(get, trackIds)
    prefetchUpcoming(get)
  },

  requestAddManyToQueue: (trackIds) => {
    if (trackIds.length === 0) return
    const unanalysedCount = tracksNeedingAnalysis(get().tracks, trackIds).length
    // Nothing to ask: no analysis choice to make, and small enough that
    // an accidental click is cheap to undo.
    if (unanalysedCount === 0 && trackIds.length <= BULK_QUEUE_CONFIRM_THRESHOLD) {
      get().addManyToPlaylist(trackIds)
      get().showToast(`${trackIds.length} track${trackIds.length === 1 ? '' : 's'} queued`)
      return
    }
    set({ queueRequest: { trackIds, unanalysedCount }, modalOpen: true })
  },

  resolveQueueRequest: (choice) => {
    const request = get().queueRequest
    set({ queueRequest: null, modalOpen: false })
    if (!request || choice === 'cancel') return
    const analyse = choice === 'analyse'
    get().addManyToPlaylist(request.trackIds, { analyse })
    const queued = `${request.trackIds.length} track${request.trackIds.length === 1 ? '' : 's'} queued`
    get().showToast(analyse && request.unanalysedCount > 0 ? `${queued} — analysing ${request.unanalysedCount}` : queued)
  },

  playNext: (trackId) => {
    set({ playlist: playNextPure(get().playlist, trackId) })
    triggerBackgroundAnalysis(get, trackId)
    prefetchUpcoming(get)
  },

  removeFromPlaylist: (index) => set({ playlist: removeFromPlaylistPure(get().playlist, index) }),

  clearPlaylist: () => set({ playlist: clearUpcomingPure(get().playlist) }),

  movePlaylistItem: (fromIndex, toIndex) => {
    set({ playlist: movePlaylistItemPure(get().playlist, fromIndex, toIndex) })
    prefetchUpcoming(get)
  },

  shufflePlaylist: () => {
    set({ playlist: shufflePlaylistPure(get().playlist) })
    prefetchUpcoming(get)
  },

  playQueueItemNow: async (index) => {
    const before = get().playlist
    const after = playQueueItemNowPure(before, index)
    if (after === before) return
    if (!(await downloadBeforePlaying(get, after[0]))) return
    // Left alone if the queue was changed while downloading.
    if (get().playlist !== before) return
    set({ playlist: after })
    triggerBackgroundAnalysis(get, after[0])
    prefetchUpcoming(get)
  },

  playQueueItemNext: (index) => {
    set({ playlist: playQueueItemNextPure(get().playlist, index) })
    prefetchUpcoming(get)
  },

  advanceToNext: async () => {
    const before = get().playlist
    const after = advanceToNextPure(before)
    if (after === before) return
    // Usually already prefetched; if not, it plays once it's down (a failed
    // download still moves on, and the player reports the error).
    if (after.length > 0) await downloadBeforePlaying(get, after[0])
    // Left alone if the queue was changed while downloading.
    if (get().playlist !== before) return
    set({ playlist: after })
    if (after.length > 0) triggerBackgroundAnalysis(get, after[0])
    prefetchUpcoming(get)
  },

  setContinuousPlay: (value) => set({ continuousPlay: value }),

  togglePlayerScreen: (screen) => set({ playerScreen: get().playerScreen === screen ? null : screen }),
  setPlayerScreen: (screen) => set({ playerScreen: screen }),

  setVisualizerOpen: (open) => set({ visualizerOpen: open }),

  setVisualizerHideTrackInfo: (hide) => {
    set({ visualizerHideTrackInfo: hide })
    writeStored(VISUALIZER_HIDE_TRACK_INFO_KEY, String(hide))
  },

  setVisualDelayMs: (ms) => {
    const value = Math.min(MAX_VISUAL_DELAY_MS, Math.max(0, Math.round(ms)))
    set({ visualDelayMs: value })
    writeStored(VISUAL_DELAY_KEY, String(value))
  },
  setScreenTarget: (target) => set({ screenTarget: target }),
  setScreenNowPlaying: (nowPlaying) => {
    set({ screenNowPlaying: nowPlaying })
    saveBooleanPreference(SCREEN_NOW_PLAYING_KEY, nowPlaying)
  },
  setScreenTheme: (theme) => {
    set({ screenTheme: theme })
    writeStored(SCREEN_THEME_KEY, theme)
  },
  setScreenHideTrackInfo: (hide) => {
    set({ screenHideTrackInfo: hide })
    saveBooleanPreference(SCREEN_HIDE_TRACK_INFO_KEY, hide)
  },
  setScreenDisplays: (displays) => set({ screenDisplays: displays }),

  setVisualizerFps: (fps) => {
    set({ visualizerFps: fps })
    writeStored(VISUALIZER_FPS_KEY, String(fps))
  },

  setPlayerLarge: (large) => {
    set({ playerLarge: large })
    writeStored(PLAYER_LARGE_KEY, String(large))
  },

  setShowMidiControls: (show) => {
    // Hiding the badges mid-learn would leave an invisible listener that
    // silently binds the next knob moved.
    set(show ? { showMidiControls: true } : { showMidiControls: false, midiLearningControl: null })
    writeStored(SHOW_MIDI_CONTROLS_KEY, String(show))
  },

  setKeyNotation: (notation) => {
    set({ keyNotation: notation })
    writeStored(KEY_NOTATION_KEY, notation)
  },

  setAppTheme: (theme) => {
    set({ appTheme: theme })
    applyAppTheme(theme)
    window.api.setAppTheme(theme).catch((err) => console.error('saving the theme failed', err))
  },

  setCompatibleFilter: (on) => set({ compatibleFilter: on, checkedTrackIds: new Set() }),
  setAnalysedFilter: (filter) => set({ analysedFilter: filter, checkedTrackIds: new Set() }),
  setEnergyFilter: (range) => set({ energyFilter: range, checkedTrackIds: new Set() }),
  setDuplicatesFilter: (on) => set({ duplicatesFilter: on, checkedTrackIds: new Set() }),
  setMcoTagsFilter: (filter) => set({ mcoTagsFilter: filter, checkedTrackIds: new Set() }),
  setMissingMetadataFilter: (on) => set({ missingMetadataFilter: on, checkedTrackIds: new Set() }),
  setMissingTracksFilter: (on) => set({ missingTracksFilter: on, checkedTrackIds: new Set() }),
  setCloudOnlyFilter: (on) => set({ cloudOnlyFilter: on, checkedTrackIds: new Set() }),
  setTagReadRemaining: (remaining) => set({ tagReadRemaining: remaining }),
  refreshTrackFileTags: async (trackId) => {
    const track = await window.api.readFileTags(trackId)
    if (!track) return
    const current = get().tracks.find((t) => t.id === trackId)
    if (
      current &&
      current.tagsRead &&
      current.title === track.title &&
      current.artist === track.artist &&
      current.album === track.album &&
      current.genreTag === track.genreTag &&
      current.year === track.year
    ) {
      return
    }
    set({ tracks: get().tracks.map((t) => (t.id === trackId ? track : t)) })
  },

  setVisualizerThemeOption: (theme, optionId, valueId) => {
    const all = get().visualizerThemeOptions
    const options = { ...all, [theme]: { ...all[theme], [optionId]: valueId } }
    set({ visualizerThemeOptions: options })
    writeStored(VISUALIZER_THEME_OPTIONS_KEY, JSON.stringify(options))
  },

  setCastScreen: (screen) => {
    set({ castScreen: screen })
    writeStored(CAST_SCREEN_KEY, screen)
  },

  setVisualizerTheme: (theme) => {
    set({ visualizerTheme: theme })
    writeStored(VISUALIZER_THEME_KEY, theme)
  },

  loadAppVersion: async () => {
    const version = await window.api.getAppVersion()
    set({ appVersion: version })
  },

  refreshTracks: async () => {
    const tracks = await window.api.getTracks()
    set({ tracks })
  },

  setTrackGenres: async (trackId, genreIds) => {
    const updated = await window.api.setTrackGenres(trackId, genreIds)
    setTrackTags(set, get, updated)
  },

  setTrackSubgenres: async (trackId, subgenreIds) => {
    const updated = await window.api.setTrackSubgenres(trackId, subgenreIds)
    setTrackTags(set, get, updated)
  },

  setSearchText: (text) => set({ searchText: text, checkedTrackIds: new Set() }),

  runScan: async (opts) => {
    const before = new Set(get().tracks.map((t) => t.id))
    await window.api.scanCollection({ removeMissing: opts?.removeMissing })
    await get().loadAll()
    if (!opts?.analyseNew) return
    const added = get()
      .tracks.filter((t) => !before.has(t.id) && t.analysisStatus !== 'done')
      .map((t) => t.id)
    // Not awaited: analysis:run resolves only once every track is done, and
    // the scan is finished — progress shows up via scan:progress as usual.
    if (added.length > 0) {
      get()
        .runAnalysis(added)
        .catch((err) => console.error('analysing new tracks failed', err))
    }
  },

  // Progress is picked up via the existing scan:progress listener/
  // refreshTracks (wired once, globally, in App.tsx) — no separate
  // polling needed here.
  runAnalysis: async (trackIds) => {
    await window.api.analyzeCollection(trackIds)
  },

  setTrackGridStart: async (trackId, start) => {
    const track = await window.api.setTrackGridStart(trackId, start)
    if (track) set({ tracks: get().tracks.map((t) => (t.id === trackId ? track : t)) })
  },

  changeTracksBpm: async (trackIds, change) => {
    // A batch takes about a second a track: say how far it is.
    const many = trackIds.length > 1 && change.kind === 'factor'
    const stopProgress = many ? window.api.onBpmProgress(({ done, total }) => get().showToast(`Refining the BPM: ${done + 1} of ${total}…`)) : null
    let result: Awaited<ReturnType<typeof window.api.changeTracksBpm>>
    try {
      result = await window.api.changeTracksBpm(trackIds, change)
    } finally {
      stopProgress?.()
    }
    const { tracks: changed, skipped } = result
    if (many && skipped.length === 0) get().showToast(`BPM refined on ${changed.length} tracks`)
    const byId = new Map(changed.map((t) => [t.id, t]))
    if (byId.size > 0) set({ tracks: get().tracks.map((t) => byId.get(t.id) ?? t) })
    if (skipped.length > 0) {
      get().showToast(skipped.length === 1 && trackIds.length === 1 ? skipped[0].reason : `${skipped.length} left as they were: ${skipped[0].reason}`)
    }
    if (change.kind === 'detect' && changed.length > 0) await get().runAnalysis(changed.map((t) => t.id))
  },

  recordPlay: async (trackId) => {
    const played = await window.api.recordPlay(trackId)
    if (!played) return
    set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, ...played } : t)) })
  },

  moveTracksToFolder: async (trackIds, folder) => {
    const { playlist, cueTrackId, showToast } = get()
    const busy = new Set([playlist[0], cueTrackId].filter((id): id is number => id != null))
    const ids = trackIds.filter((id) => !busy.has(id))
    if (ids.length === 0) {
      if (trackIds.length > 0) showToast("A track that's playing can't be moved")
      return
    }
    const result = await window.api.moveTracksToFolder(ids, folder)
    if (result.cancelled) return
    const moved = new Map(result.moved.map((m) => [m.id, m]))
    if (moved.size > 0) {
      set({ tracks: get().tracks.map((t) => (moved.has(t.id) ? { ...t, path: moved.get(t.id)!.path, folder: moved.get(t.id)!.folder } : t)) })
    }
    const folderName = baseName(folder)
    const notes = [
      moved.size > 0 ? `Moved ${moved.size === 1 ? 'the song' : `${moved.size} songs`} to ${folderName}` : '',
      result.conflicts > 0 ? `${result.conflicts} not moved: same file name already there` : '',
      result.failed > 0 ? `${result.failed} couldn't be moved` : '',
      trackIds.length > ids.length ? "the playing track wasn't moved" : '',
    ].filter(Boolean)
    if (notes.length > 0) showToast(notes.join(' · '))
  },

  trashTrack: async (trackId) => {
    const result = await window.api.trashTrack(trackId)
    if (!result.ok) return result.error
    const checkedTrackIds = new Set(get().checkedTrackIds)
    checkedTrackIds.delete(trackId)
    set({
      tracks: get().tracks.filter((t) => t.id !== trackId),
      playlist: get().playlist.filter((id) => id !== trackId),
      checkedTrackIds,
      cueTrackId: get().cueTrackId === trackId ? null : get().cueTrackId,
    })
    return null
  },

  writeTrackTags: async (trackId, tags) => {
    const result = await window.api.writeTrackTags(trackId, tags)
    if (!result.ok) return result.error
    set({ tracks: get().tracks.map((t) => (t.id === trackId ? result.track : t)) })
    return null
  },

  stopAnalysis: async () => {
    await window.api.stopAnalysis()
  },

  ...createTagSlice(set, get),
}))
