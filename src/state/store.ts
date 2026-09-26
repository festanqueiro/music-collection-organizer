// src/state/store.ts
import { create, type StoreApi } from 'zustand'
import type {
  Track,
  EditableTags,
  Genre,
  Subgenre,
  ImportResult,
  GenreDeletionSnapshot,
  SubgenreDeletionSnapshot,
  EffectsSettings,
  MidiMappings,
  MidiControlKey,
  MidiBinding,
  TrackTableColumnKey,
  TrackTableSortState,
  UpdateState,
  CastDevice,
  CastStatus,
} from '../types'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_TRACK_TABLE_COLUMN_ORDER, SIREN_MODES, SIREN_BEATS, DELAY_DIVISIONS } from '../types'
import { scaleMidiValue, scaleMidiValueToOption, sendMidiFeedback } from '../audio/midi'
import { getDubSirenEngine } from '../audio/sirenEngine'
import type { TrackTagIds } from './tagFilter'

// 'unanalysed' includes tracks whose analysis failed.
export type AnalysedFilter = 'all' | 'analysed' | 'unanalysed'
// MCO's own tags: 'no-tags' = no Tags at all (so no Subtags either);
// 'no-subtags' = no Subtag, whether or not it has Tags.
export type McoTagsFilter = 'all' | 'no-tags' | 'no-subtags'
import { isTvVisualizer, type AnyVisualizerThemeId } from '../cast/tvVisualizers'
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

// Debounced rather than saved on every slider tick — dragging a knob fires
// onChange continuously, and writing to electron-store on every tick would
// mean dozens of synchronous disk writes per second while dragging.
let effectsSettingsSaveTimeout: ReturnType<typeof setTimeout> | null = null

// Backs showToast's auto-dismiss below.
let toastTimeout: ReturnType<typeof setTimeout> | null = null

// Coalesces rapid MIDI CC bursts to at most one store update per animation
// frame, per control — a touch-sensitive hardware knob/fader can send
// hundreds of CC messages a second, and applying every single one
// synchronously (a full setEffectsSettings call: re-renders every knob in
// FxPanel, which subscribes to the whole effectsSettings object, plus
// reschedules the debounced-save timer) floods the render loop far faster
// than the UI can keep up — the on-screen knob visibly lags well behind
// the physical one. This is the same reasoning as FxPanel's own
// useRafThrottledCommit for mouse-dragged knobs, just applied at the
// actual bottleneck (every MIDI-driven continuous control, not only the
// two knobs that hook happens to cover) — mouse drags fire at the
// browser's own pointermove rate (already frame-aligned-ish), MIDI CC
// bursts don't. Keyed per control so turning two knobs in the same frame
// commits both, and each commit re-reads the store fresh when it actually
// runs (not a snapshot captured back when it was scheduled), so neither
// clobbers a change the other already applied earlier in the same frame.
const pendingMidiCommits = new Map<string, () => void>()
let midiRafScheduled = false

function scheduleMidiCommit(key: string, commit: () => void): void {
  pendingMidiCommits.set(key, commit)
  if (midiRafScheduled) return
  midiRafScheduled = true
  const flush = () => {
    midiRafScheduled = false
    const commits = [...pendingMidiCommits.values()]
    pendingMidiCommits.clear()
    for (const c of commits) c()
  }
  // requestAnimationFrame doesn't exist outside a real browser environment
  // (e.g. this module under Vitest's node environment) — a ~60fps
  // setTimeout fallback keeps the same coalescing behavior there instead
  // of throwing.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

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

// Kicks off analysis for one track in the background if it needs it —
// shared by ensureTrackReady (the track becoming current) and the queueing
// actions below (a track landing in the queue at all, even before it's
// current, per the same "explicit user action" reasoning: adding it to
// the queue is itself deliberate). A cloud-only track has no local file
// yet — analysis:run's own query already excludes those, but checking
// here too avoids a pointless IPC round-trip for one that obviously can't
// run.
function triggerBackgroundAnalysis(get: StoreApi<CollectionState>['getState'], trackId: number): void {
  triggerBackgroundAnalysisForMany(get, [trackId])
}

// Batches every track that actually needs it into a single analysis:run
// call — used for "Add all to queue" so queueing a whole folder doesn't
// fire off one IPC round-trip per track.
// Local tracks that haven't been (successfully) analysed yet. Cloud-only
// tracks are skipped — they're analysed once downloaded, which happens
// when they're loaded in the player (see ensureTrackReady).
function tracksNeedingAnalysis(tracks: Track[], trackIds: number[]): number[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return trackIds.filter((id) => {
    const track = byId.get(id)
    return track && track.cloudStatus === 'local' && (track.analysisStatus === 'pending' || track.analysisStatus === 'error')
  })
}
// Also re-analyses tracks analysed before loudness/energy existed, so they
// fill in as they're played or queued rather than all at once. Deliberately
// not part of tracksNeedingAnalysis, which the queue dialog counts as
// "unanalysed".
function tracksMissingEnergy(tracks: Track[], trackIds: number[]): number[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return trackIds.filter((id) => {
    const track = byId.get(id)
    return track && track.cloudStatus === 'local' && track.analysisStatus === 'done' && track.energy === null
  })
}
function triggerBackgroundAnalysisForMany(get: StoreApi<CollectionState>['getState'], trackIds: number[]): void {
  const tracks = get().tracks
  const ids = [...tracksNeedingAnalysis(tracks, trackIds), ...tracksMissingEnergy(tracks, trackIds)]
  if (ids.length === 0) return
  get()
    .runAnalysis(ids)
    .catch((err) => console.error('background analysis of queued track(s) failed', err))
}

// A cloud-only track has no local audio to stream yet, so it's downloaded
// first (blocking — nothing to play until it lands). A pending/error track
// still plays immediately (analysis isn't needed for playback), but kicks
// off a background analysis run for just that track — loading a track into
// the player is itself an explicit user action, so triggering analysis as
// its consequence is fine; this is distinct from analysing the whole
// collection silently on its own. Called only by actions that make a track
// the one actively playing (playTrackNow/advanceToNext).
async function ensureTrackReady(
  set: StoreApi<CollectionState>['setState'],
  get: StoreApi<CollectionState>['getState'],
  trackId: number
): Promise<void> {
  const track = get().tracks.find((t) => t.id === trackId)
  if (!track) return

  if (track.cloudStatus === 'cloud_only') {
    try {
      await window.api.downloadTrack(trackId)
      await get().loadAll()
    } catch (err) {
      console.error('failed to download track before playing it', err)
      return
    }
  }

  triggerBackgroundAnalysis(get, trackId)
}

// Registered by the mounted Player (see playbackControls below).
export interface PlaybackControls {
  toggle: () => void
  cueDown: () => void
  cueUp: () => void
}

export type PlayerScreen = 'queue' | 'fx'

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
  // A threejs-visualisers theme, or a TV-only one (src/cast/tvVisualizers.ts).
  visualizerTheme: AnyVisualizerThemeId
  setVisualizerTheme: (theme: AnyVisualizerThemeId) => void
  // Chosen value per theme option (see VisualizerTheme.options); an option
  // with no entry uses its first value.
  visualizerThemeOptions: Partial<Record<AnyVisualizerThemeId, Record<string, string>>>
  setVisualizerThemeOption: (theme: AnyVisualizerThemeId, optionId: string, valueId: string) => void
  // Track title/artist stays on screen in the Visualizer unless this
  // is switched on — unlike the theme picker/close controls, which fade
  // out whenever the mouse is idle.
  visualizerHideTrackInfo: boolean
  setVisualizerHideTrackInfo: (hide: boolean) => void
  // Whether MIDI-learn badges are shown next to mappable controls
  // (Settings → MIDI). Purely visual — bindings keep working when hidden.
  showMidiControls: boolean
  setShowMidiControls: (show: boolean) => void
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
  duplicatesFilter: boolean
  setDuplicatesFilter: (on: boolean) => void
  mcoTagsFilter: McoTagsFilter
  setMcoTagsFilter: (filter: McoTagsFilter) => void
  // Tracks whose file has no artist or title (see missingMetadata.ts).
  missingMetadataFilter: boolean
  setMissingMetadataFilter: (on: boolean) => void
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
  midiMappings: MidiMappings
  midiLearningControl: MidiControlKey | null
  loadMidiMappings: () => Promise<void>
  columnOrder: TrackTableColumnKey[]
  loadColumnOrder: () => Promise<void>
  setColumnOrder: (order: TrackTableColumnKey[]) => void
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
  runScan: (opts?: { analyseNew?: boolean }) => Promise<void>
  runAnalysis: (trackIds?: number[]) => Promise<void>
  // One play of a track (see Player.tsx): bumps its play count.
  recordPlay: (trackId: number) => Promise<void>
  // Moves a track's file to the Trash and drops it from the collection,
  // queue and selection; returns an error message, or null.
  trashTrack: (trackId: number) => Promise<string | null>
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
const VISUALIZER_THEME_IDS: AnyVisualizerThemeId[] = ['nebula', 'warp', 'horizon', 'soundsystem', 'smoke', 'kaleidoscope', 'paint', 'liquid']
function loadVisualizerTheme(): AnyVisualizerThemeId {
  try {
    const stored = localStorage.getItem(VISUALIZER_THEME_KEY)
    if (stored && ((VISUALIZER_THEME_IDS as string[]).includes(stored) || isTvVisualizer(stored))) {
      return stored as AnyVisualizerThemeId
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
function loadVisualizerHideTrackInfo(): boolean {
  try {
    return localStorage.getItem(VISUALIZER_HIDE_TRACK_INFO_KEY) === 'true'
  } catch {
    return false
  }
}

const CAST_MUTE_LOCAL_KEY = 'castMuteLocal'
function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
function saveBooleanPreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Non-essential preference — fine to lose.
  }
}

const SHOW_MIDI_CONTROLS_KEY = 'showMidiControls'
function loadShowMidiControls(): boolean {
  try {
    return localStorage.getItem(SHOW_MIDI_CONTROLS_KEY) !== 'false'
  } catch {
    return true
  }
}

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
  visualizerHideTrackInfo: loadVisualizerHideTrackInfo(),
  visualizerThemeOptions: loadVisualizerThemeOptions(),
  showMidiControls: loadShowMidiControls(),
  keyNotation: loadKeyNotation(),
  appTheme: loadAppTheme(),
  compatibleFilter: false,
  analysedFilter: 'all',
  duplicatesFilter: false,
  missingMetadataFilter: false,
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
  delayDivisionSync: null,
  midiMappings: {},
  columnOrder: [...DEFAULT_TRACK_TABLE_COLUMN_ORDER],
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
      ['eq.enabled', settings.eq.enabled, previous.eq.enabled],
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

  setPlaybackControls: (controls) => set({ playbackControls: controls }),
  setPlayerPlaying: (playing) => set({ playerPlaying: playing }),
  setCastStatus: (status) => set({ castStatus: status }),
  setCastDevices: (devices) => set({ castDevices: devices }),
  setCastMuteLocal: (mute) => {
    set({ castMuteLocal: mute })
    saveBooleanPreference(CAST_MUTE_LOCAL_KEY, mute)
  },
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
    try {
      localStorage.setItem(CUE_VOLUME_KEY, String(volume))
    } catch {
      // Non-essential preference — fine to lose.
    }
  },

  setAudioOutputDeviceId: async (deviceId) => {
    set({ audioOutputDeviceId: deviceId })
    await window.api.setAudioOutputDeviceId(deviceId)
  },

  startMidiLearn: (control) => set({ midiLearningControl: control }),

  cancelMidiLearn: () => set({ midiLearningControl: null }),

  clearMidiMapping: (control) => {
    const mappings = { ...get().midiMappings }
    delete mappings[control]
    set({ midiMappings: mappings })
    window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
  },

  resetMidiMappings: () => get().replaceMidiMappings({}),

  replaceMidiMappings: (mappings) => {
    set({ midiMappings: mappings, midiLearningControl: null })
    window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
  },

  // Called by the single global MIDI listener mounted in App.tsx — either
  // binds the incoming CC to whichever control is in "learn" mode, or (if
  // nothing is learning) looks up a matching existing binding and applies
  // the scaled value to the corresponding piece of state.
  handleMidiControlChange: (channel, controller, value, kind) => {
    const learning = get().midiLearningControl
    if (learning) {
      const binding: MidiBinding = { channel, controller, kind }
      // A stale binding on another control key can already occupy this
      // exact physical channel+controller+kind (e.g. it was tried against
      // a different control earlier, or the same hardware button was
      // re-learned for something else without unbinding the old one
      // first) — handleMidiControlChange's lookup below picks the FIRST
      // key it finds for a given channel+controller, so leaving that
      // stale entry in place meant the button just learned here could
      // silently keep triggering the OLD control instead, looking exactly
      // like "I assigned it and now it does nothing". Learning a control
      // onto a physical button always makes that button exclusively its.
      const previousMappings = { ...get().midiMappings }
      for (const key of Object.keys(previousMappings) as MidiControlKey[]) {
        if (key === learning) continue
        const existing = previousMappings[key]
        if (existing && existing.channel === channel && existing.controller === controller && (existing.kind ?? 'cc') === kind) {
          delete previousMappings[key]
        }
      }
      const mappings = { ...previousMappings, [learning]: binding }
      set({ midiMappings: mappings, midiLearningControl: null })
      window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
      // Sync the LED to the control's current state right away, rather
      // than leaving it showing whatever it happened to be at (e.g. lit
      // from a previous binding) until the next toggle.
      const currentEffectsSettings = get().effectsSettings
      if (learning === 'delay.enabled') sendMidiFeedback(binding, currentEffectsSettings.delay.enabled)
      else if (learning === 'reverb.enabled') sendMidiFeedback(binding, currentEffectsSettings.reverb.enabled)
      else if (learning === 'filter.enabled') sendMidiFeedback(binding, currentEffectsSettings.filter.enabled)
      else if (learning === 'eq.enabled') sendMidiFeedback(binding, currentEffectsSettings.eq.enabled)
      else if (learning === 'siren.enabled') sendMidiFeedback(binding, currentEffectsSettings.siren.enabled)
      return
    }

    const mappings = get().midiMappings
    // kind must match too, not just channel+controller — Note and CC
    // messages occupy independent number spaces on real hardware (Note 25
    // and CC 25 are unrelated), so a Note-mapped control and a CC-mapped
    // control can legitimately share the same controller number without
    // being the same physical button. Ignoring kind here meant a Note
    // press could match whichever CC-bound control happened to iterate
    // first instead of the Note-bound control it was actually meant for —
    // e.g. a "Play Next" pad (Note 25) got treated as a filter.highpass
    // (CC 25) knob move and silently never advanced the queue.
    const match = (Object.keys(mappings) as MidiControlKey[]).find((key) => {
      const binding = mappings[key]
      return binding && binding.channel === channel && binding.controller === controller && (binding.kind ?? 'cc') === kind
    })
    if (!match) return

    // Discrete controls (a fixed option list, not a continuous range) are
    // handled before scaleMidiValue — a knob bound to one of these sweeps
    // through the options in order rather than producing a raw number.
    if (match === 'siren.mode' || match === 'siren.beat') {
      const effectsSettings = get().effectsSettings
      if (match === 'siren.mode') {
        get().setEffectsSettings({
          ...effectsSettings,
          siren: { ...effectsSettings.siren, mode: scaleMidiValueToOption(SIREN_MODES, value) },
        })
      } else {
        get().setEffectsSettings({
          ...effectsSettings,
          siren: { ...effectsSettings.siren, beat: scaleMidiValueToOption(SIREN_BEATS, value) },
        })
      }
      return
    }

    // Also discrete, but not a persisted setting — the same one-shot
    // "recompute delay.timeMs from the current track's BPM" action the
    // Division knob's UI performs on change, not a value that sticks
    // around (a track swap doesn't retroactively resync it, same as
    // turning the on-screen knob wouldn't either without moving it again).
    if (match === 'delay.division') {
      const index = DELAY_DIVISIONS.indexOf(scaleMidiValueToOption(DELAY_DIVISIONS, value))
      get().delayDivisionSync?.(index)
      return
    }

    // Momentary trigger, not a toggle like delay.enabled/reverb.enabled —
    // press (nonzero) sounds the siren for as long as it's held, release
    // (0) stops it, mirroring the on-screen button and the hold-S
    // keyboard shortcut exactly (same enabled/beat guard, same engine
    // calls) rather than flipping a persisted setting.
    if (match === 'siren.trigger') {
      const { siren } = get().effectsSettings
      const engine = getDubSirenEngine()
      if (value !== 0) {
        if (siren.enabled && siren.beat === 'off') {
          engine.resume()
          engine.triggerDown()
          set({ sirenTriggered: true })
        }
      } else {
        engine.triggerUp()
        set({ sirenTriggered: false })
      }
      return
    }

    // player.playPause toggles on the press edge (mirrors delay.enabled's
    // momentary-button handling) via the imperative toggle Player.tsx
    // registers on mount — a no-op if nothing's loaded. player.playNext
    // fires once per press with no release behavior, same as any other
    // one-shot trigger; it works even with nothing currently mounted,
    // since advanceToNext is a plain store action.
    if (match === 'player.playPause') {
      if (value !== 0) get().playbackControls?.toggle()
      return
    }
    if (match === 'player.playNext') {
      if (value !== 0) get().advanceToNext()
      return
    }
    // CDJ-style CUE: press and release both matter (holding at the cue
    // point previews, releasing snaps back), unlike playPause's press-only
    // edge.
    if (match === 'player.cue') {
      const controls = get().playbackControls
      if (value !== 0) controls?.cueDown()
      else controls?.cueUp()
      return
    }

    const scaled = scaleMidiValue(match, value)
    if (match === 'volume') {
      scheduleMidiCommit('volume', () => get().setPlayerVolume(scaled))
      return
    }

    const effectsSettings = get().effectsSettings
    // delay.enabled/reverb.enabled are bound to a MIDI Mix mute-style
    // button, confirmed momentary (sends a nonzero message on press and a
    // 0 on release, rather than a hardware-latched on/off state) — mirroring
    // the raw value directly made the effect only stay on while physically
    // held. Toggle once on the press edge instead, and ignore the release
    // message entirely, so one tap flips the state and it stays there.
    // These are one-shot presses, not a continuous stream, so — unlike
    // every branch below — they apply immediately rather than through
    // scheduleMidiCommit.
    if (match === 'delay.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        delay: { ...effectsSettings.delay, enabled: !effectsSettings.delay.enabled },
      })
    } else if (match === 'delay.timeMs') {
      scheduleMidiCommit('delay.timeMs', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, delay: { ...es.delay, timeMs: scaled } })
      })
    } else if (match === 'delay.feedback') {
      scheduleMidiCommit('delay.feedback', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, delay: { ...es.delay, feedback: scaled } })
      })
    } else if (match === 'delay.mix') {
      scheduleMidiCommit('delay.mix', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, delay: { ...es.delay, mix: scaled } })
      })
    } else if (match === 'reverb.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        reverb: { ...effectsSettings.reverb, enabled: !effectsSettings.reverb.enabled },
      })
    } else if (match === 'reverb.mix') {
      scheduleMidiCommit('reverb.mix', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, reverb: { ...es.reverb, mix: scaled } })
      })
    } else if (match === 'reverb.decaySeconds') {
      scheduleMidiCommit('reverb.decaySeconds', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, reverb: { ...es.reverb, decaySeconds: scaled } })
      })
    } else if (match === 'reverb.preDelayMs') {
      scheduleMidiCommit('reverb.preDelayMs', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, reverb: { ...es.reverb, preDelayMs: scaled } })
      })
    } else if (match === 'filter.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        filter: { ...effectsSettings.filter, enabled: !effectsSettings.filter.enabled },
      })
    } else if (match === 'filter.lowpass') {
      scheduleMidiCommit('filter.lowpass', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, filter: { ...es.filter, lowpass: scaled } })
      })
    } else if (match === 'filter.highpass') {
      scheduleMidiCommit('filter.highpass', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, filter: { ...es.filter, highpass: scaled } })
      })
    } else if (match === 'filter.resonance') {
      scheduleMidiCommit('filter.resonance', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, filter: { ...es.filter, resonance: scaled } })
      })
    } else if (match === 'filter.mix') {
      scheduleMidiCommit('filter.mix', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, filter: { ...es.filter, mix: scaled } })
      })
    } else if (match === 'eq.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        eq: { ...effectsSettings.eq, enabled: !effectsSettings.eq.enabled },
      })
    } else if (match === 'eq.low') {
      scheduleMidiCommit('eq.low', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, eq: { ...es.eq, low: scaled } })
      })
    } else if (match === 'eq.mid') {
      scheduleMidiCommit('eq.mid', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, eq: { ...es.eq, mid: scaled } })
      })
    } else if (match === 'eq.high') {
      scheduleMidiCommit('eq.high', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, eq: { ...es.eq, high: scaled } })
      })
    } else if (match === 'eq.mix') {
      scheduleMidiCommit('eq.mix', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, eq: { ...es.eq, mix: scaled } })
      })
    } else if (match === 'siren.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        siren: { ...effectsSettings.siren, enabled: !effectsSettings.siren.enabled },
      })
    } else if (match === 'siren.pitchHz') {
      scheduleMidiCommit('siren.pitchHz', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, siren: { ...es.siren, pitchHz: scaled } })
      })
    } else if (match === 'siren.speedHz') {
      scheduleMidiCommit('siren.speedHz', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, siren: { ...es.siren, speedHz: scaled } })
      })
    } else if (match === 'siren.depth') {
      scheduleMidiCommit('siren.depth', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, siren: { ...es.siren, depth: scaled } })
      })
    } else if (match === 'siren.level') {
      scheduleMidiCommit('siren.level', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, siren: { ...es.siren, level: scaled } })
      })
    } else if (match === 'siren.echoFeedback') {
      scheduleMidiCommit('siren.echoFeedback', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, siren: { ...es.siren, echoFeedback: scaled } })
      })
    } else if (match === 'master.volume') {
      scheduleMidiCommit('master.volume', () => {
        const es = get().effectsSettings
        get().setEffectsSettings({ ...es, masterVolume: scaled })
      })
    }
  },

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
    const [tracks, genres, subgenres, tagIdRows] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getAllTagIds(),
    ])
    const trackTags = new Map(tagIdRows.map((r) => [r.trackId, r]))
    // Keeps the batch selection across a reload (creating/renaming/
    // recolouring/deleting a tag, an import, a download all go through
    // here, often mid-way through batch tagging) — only dropping tracks
    // that no longer exist, e.g. after a rescan marked them missing.
    const trackIds = new Set(tracks.map((t) => t.id))
    const checkedTrackIds = new Set([...get().checkedTrackIds].filter((id) => trackIds.has(id)))
    set({ tracks, genres, subgenres, trackTags, checkedTrackIds })
  },

  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  setModalOpen: (open) => set({ modalOpen: open }),

  // Deliberately separate from row selection (which only drives
  // DetailPanel) — the player is independent, so browsing/checking
  // details on other tracks doesn't interrupt whatever's currently
  // loaded and playing. Only these explicit actions change it.
  playTrackNow: async (trackId) => {
    set({ playlist: playTrackNowPure(get().playlist, trackId) })
    await ensureTrackReady(set, get, trackId)
  },

  addToPlaylist: (trackId) => {
    set({ playlist: addToPlaylistPure(get().playlist, trackId) })
    triggerBackgroundAnalysis(get, trackId)
  },

  addManyToPlaylist: (trackIds, options) => {
    set({ playlist: addManyToPlaylistPure(get().playlist, trackIds) })
    if (options?.analyse ?? true) triggerBackgroundAnalysisForMany(get, trackIds)
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
  },

  removeFromPlaylist: (index) => set({ playlist: removeFromPlaylistPure(get().playlist, index) }),

  clearPlaylist: () => set({ playlist: clearUpcomingPure(get().playlist) }),

  movePlaylistItem: (fromIndex, toIndex) =>
    set({ playlist: movePlaylistItemPure(get().playlist, fromIndex, toIndex) }),

  shufflePlaylist: () => set({ playlist: shufflePlaylistPure(get().playlist) }),

  playQueueItemNow: async (index) => {
    const before = get().playlist
    const after = playQueueItemNowPure(before, index)
    if (after === before) return
    set({ playlist: after })
    await ensureTrackReady(set, get, after[0])
  },

  playQueueItemNext: (index) => set({ playlist: playQueueItemNextPure(get().playlist, index) }),

  advanceToNext: async () => {
    const before = get().playlist
    const after = advanceToNextPure(before)
    if (after === before) return
    set({ playlist: after })
    if (after.length > 0) await ensureTrackReady(set, get, after[0])
  },

  setContinuousPlay: (value) => set({ continuousPlay: value }),

  togglePlayerScreen: (screen) => set({ playerScreen: get().playerScreen === screen ? null : screen }),
  setPlayerScreen: (screen) => set({ playerScreen: screen }),

  setVisualizerOpen: (open) => set({ visualizerOpen: open }),

  setVisualizerHideTrackInfo: (hide) => {
    set({ visualizerHideTrackInfo: hide })
    try {
      localStorage.setItem(VISUALIZER_HIDE_TRACK_INFO_KEY, String(hide))
    } catch {
      // Non-essential preference — fine to lose.
    }
  },

  setShowMidiControls: (show) => {
    // Hiding the badges mid-learn would leave an invisible listener that
    // silently binds the next knob moved.
    set(show ? { showMidiControls: true } : { showMidiControls: false, midiLearningControl: null })
    try {
      localStorage.setItem(SHOW_MIDI_CONTROLS_KEY, String(show))
    } catch {
      // Non-essential preference — fine to lose.
    }
  },

  setKeyNotation: (notation) => {
    set({ keyNotation: notation })
    try {
      localStorage.setItem(KEY_NOTATION_KEY, notation)
    } catch {
      // Non-essential preference — fine to lose.
    }
  },

  setAppTheme: (theme) => {
    set({ appTheme: theme })
    applyAppTheme(theme)
    window.api.setAppTheme(theme).catch((err) => console.error('saving the theme failed', err))
  },

  setCompatibleFilter: (on) => set({ compatibleFilter: on, checkedTrackIds: new Set() }),
  setAnalysedFilter: (filter) => set({ analysedFilter: filter, checkedTrackIds: new Set() }),
  setDuplicatesFilter: (on) => set({ duplicatesFilter: on, checkedTrackIds: new Set() }),
  setMcoTagsFilter: (filter) => set({ mcoTagsFilter: filter, checkedTrackIds: new Set() }),
  setMissingMetadataFilter: (on) => set({ missingMetadataFilter: on, checkedTrackIds: new Set() }),
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
    try {
      localStorage.setItem(VISUALIZER_THEME_OPTIONS_KEY, JSON.stringify(options))
    } catch {
      // Non-essential preference — fine to lose.
    }
  },

  setVisualizerTheme: (theme) => {
    set({ visualizerTheme: theme })
    try {
      localStorage.setItem(VISUALIZER_THEME_KEY, theme)
    } catch {
      // Non-essential preference — fine to lose.
    }
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
    await window.api.scanCollection()
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

  recordPlay: async (trackId) => {
    const played = await window.api.recordPlay(trackId)
    if (!played) return
    set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, ...played } : t)) })
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

  createGenre: async (name) => {
    if (!name.trim()) return
    await window.api.createGenre(name.trim())
    await get().loadAll()
  },

  createSubgenre: async (name, genreId) => {
    if (!name.trim()) return
    await window.api.createSubgenre(name.trim(), genreId)
    await get().loadAll()
  },

  renameGenre: async (genreId, name) => {
    if (!name.trim()) return
    await window.api.renameGenre(genreId, name.trim())
    await get().loadAll()
  },

  renameSubgenre: async (subgenreId, name) => {
    if (!name.trim()) return
    await window.api.renameSubgenre(subgenreId, name.trim())
    await get().loadAll()
  },

  setGenreColor: async (genreId, color) => {
    await window.api.setGenreColor(genreId, color)
    await get().loadAll()
  },

  setSubgenreColor: async (subgenreId, color) => {
    await window.api.setSubgenreColor(subgenreId, color)
    await get().loadAll()
  },

  deleteGenre: async (genreId) => {
    const snapshot = await window.api.deleteGenre(genreId)
    await get().loadAll()
    const prev = get().pendingGenreDeletion
    if (prev) clearTimeout(prev.timeoutId)
    const timeoutId = setTimeout(() => set({ pendingGenreDeletion: null }), 8000)
    set({ pendingGenreDeletion: { snapshot, timeoutId } })
  },

  undoGenreDeletion: async () => {
    const pending = get().pendingGenreDeletion
    if (!pending) return
    clearTimeout(pending.timeoutId)
    try {
      await window.api.undoDeleteGenre(pending.snapshot)
      set({ pendingGenreDeletion: null })
      await get().loadAll()
    } catch (err) {
      console.error('undo genre deletion failed', err)
      set({ pendingGenreDeletion: null })
    }
  },

  dismissGenreDeletionUndo: () => {
    const pending = get().pendingGenreDeletion
    if (pending) clearTimeout(pending.timeoutId)
    set({ pendingGenreDeletion: null })
  },

  deleteSubgenre: async (subgenreId) => {
    const snapshot = await window.api.deleteSubgenre(subgenreId)
    await get().loadAll()
    const prev = get().pendingSubgenreDeletion
    if (prev) clearTimeout(prev.timeoutId)
    const timeoutId = setTimeout(() => set({ pendingSubgenreDeletion: null }), 8000)
    set({ pendingSubgenreDeletion: { snapshot, timeoutId } })
  },

  undoSubgenreDeletion: async () => {
    const pending = get().pendingSubgenreDeletion
    if (!pending) return
    clearTimeout(pending.timeoutId)
    try {
      await window.api.undoDeleteSubgenre(pending.snapshot)
      set({ pendingSubgenreDeletion: null })
      await get().loadAll()
    } catch (err) {
      console.error('undo subgenre deletion failed', err)
      set({ pendingSubgenreDeletion: null })
    }
  },

  dismissSubgenreDeletionUndo: () => {
    const pending = get().pendingSubgenreDeletion
    if (pending) clearTimeout(pending.timeoutId)
    set({ pendingSubgenreDeletion: null })
  },

  toggleTrackChecked: (trackId) => {
    const next = new Set(get().checkedTrackIds)
    if (next.has(trackId)) next.delete(trackId)
    else next.add(trackId)
    set({ checkedTrackIds: next })
  },

  setTracksChecked: (trackIds, checked) => {
    const next = new Set(get().checkedTrackIds)
    for (const id of trackIds) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    set({ checkedTrackIds: next })
  },

  clearCheckedTracks: () => set({ checkedTrackIds: new Set() }),

  addTagsToCheckedTracks: async (tagIds: { genreIds: number[]; subgenreIds: number[] }) => {
    const trackIds = Array.from(get().checkedTrackIds)
    if (trackIds.length === 0) return
    const updated = await window.api.batchAddTags(trackIds, tagIds)
    const trackTags = new Map(get().trackTags)
    for (const u of updated) trackTags.set(u.trackId, u)
    set({ trackTags })
  },

  exportTagData: () => window.api.exportTagData(),

  importTagData: async () => {
    const result = await window.api.importTagData()
    if (result) await get().loadAll()
    return result
  },
}))
