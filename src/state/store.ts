// src/state/store.ts
import { create, type StoreApi } from 'zustand'
import type {
  Track,
  Genre,
  Subgenre,
  Mood,
  ImportResult,
  GenreDeletionSnapshot,
  EffectsSettings,
  MidiMappings,
  MidiControlKey,
  MidiBinding,
  TrackTableColumnKey,
} from '../types'
import { DEFAULT_EFFECTS_SETTINGS, DEFAULT_TRACK_TABLE_COLUMN_ORDER, SIREN_MODES, SIREN_BEATS } from '../types'
import { scaleMidiValue, scaleMidiValueToOption, sendMidiFeedback } from '../audio/midi'
import { getDubSirenEngine } from '../audio/sirenEngine'
import type { TrackTagIds } from './tagFilter'
import {
  playTrackNow as playTrackNowPure,
  addToPlaylist as addToPlaylistPure,
  addManyToPlaylist as addManyToPlaylistPure,
  playNext as playNextPure,
  removeFromPlaylist as removeFromPlaylistPure,
  movePlaylistItem as movePlaylistItemPure,
  advanceToNext as advanceToNextPure,
} from './playlist'

// Debounced rather than saved on every slider tick — dragging a knob fires
// onChange continuously, and writing to electron-store on every tick would
// mean dozens of synchronous disk writes per second while dragging.
let effectsSettingsSaveTimeout: ReturnType<typeof setTimeout> | null = null

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
function triggerBackgroundAnalysisForMany(get: StoreApi<CollectionState>['getState'], trackIds: number[]): void {
  const tracks = get().tracks
  const ids = trackIds.filter((id) => {
    const track = tracks.find((t) => t.id === id)
    return track && track.cloudStatus === 'local' && (track.analysisStatus === 'pending' || track.analysisStatus === 'error')
  })
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

interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  moods: Mood[]
  trackTags: Map<number, TrackTagIds>
  checkedTrackIds: Set<number>
  pendingGenreDeletion: { snapshot: GenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
  playlist: number[]
  continuousPlay: boolean
  playerExpanded: boolean
  playTrackNow: (trackId: number) => Promise<void>
  addToPlaylist: (trackId: number) => void
  addManyToPlaylist: (trackIds: number[]) => void
  playNext: (trackId: number) => void
  removeFromPlaylist: (index: number) => void
  movePlaylistItem: (fromIndex: number, toIndex: number) => void
  advanceToNext: () => Promise<void>
  setContinuousPlay: (value: boolean) => void
  setPlayerExpanded: (value: boolean) => void
  // Imperative escape hatch so a MIDI-bound player.playPause control (and
  // eventually the spacebar/other external triggers) can toggle playback
  // without lifting the actual playing/paused boolean — which the <audio>
  // element itself owns — out of Player.tsx and into the store. Player
  // registers its toggle function on mount, clears it on unmount; null
  // when nothing is loaded, so a stray MIDI press with nothing playing is
  // silently a no-op instead of throwing.
  playbackControls: { toggle: () => void } | null
  setPlaybackControls: (controls: { toggle: () => void } | null) => void
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
  midiMappings: MidiMappings
  midiLearningControl: MidiControlKey | null
  loadMidiMappings: () => Promise<void>
  columnOrder: TrackTableColumnKey[]
  loadColumnOrder: () => Promise<void>
  setColumnOrder: (order: TrackTableColumnKey[]) => void
  startMidiLearn: (control: MidiControlKey) => void
  cancelMidiLearn: () => void
  clearMidiMapping: (control: MidiControlKey) => void
  handleMidiControlChange: (channel: number, controller: number, value: number, kind: 'cc' | 'note') => void
  loadCollectionFolder: () => Promise<void>
  pickCollectionFolder: () => Promise<boolean>
  loadAll: () => Promise<void>
  setAnalysisProgress: (progress: { done: number; total: number } | null) => void
  setModalOpen: (open: boolean) => void
  refreshTracks: () => Promise<void>
  setTrackGenres: (trackId: number, genreIds: number[]) => Promise<void>
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) => Promise<void>
  setTrackMoods: (trackId: number, moodIds: number[]) => Promise<void>
  setSearchText: (text: string) => void
  runScan: () => Promise<void>
  runAnalysis: (trackIds?: number[]) => Promise<void>
  stopAnalysis: () => Promise<void>
  createGenre: (name: string) => Promise<void>
  createSubgenre: (name: string, genreId: number) => Promise<void>
  createMood: (name: string) => Promise<void>
  deleteGenre: (genreId: number) => Promise<void>
  undoGenreDeletion: () => Promise<void>
  dismissGenreDeletionUndo: () => void
  toggleTrackChecked: (trackId: number) => void
  setTracksChecked: (trackIds: number[], checked: boolean) => void
  clearCheckedTracks: () => void
  addTagsToCheckedTracks: (tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }) => Promise<void>
  exportTagData: () => Promise<{ path: string } | null>
  importTagData: () => Promise<ImportResult | null>
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  genres: [],
  subgenres: [],
  moods: [],
  trackTags: new Map(),
  checkedTrackIds: new Set(),
  pendingGenreDeletion: null,
  playlist: [],
  continuousPlay: true,
  playerExpanded: false,
  searchText: '',
  collectionFolder: null,
  analysisProgress: null,
  modalOpen: false,
  appVersion: null,
  effectsSettings: DEFAULT_EFFECTS_SETTINGS,
  playerVolume: 1,
  playbackProgress: 0,
  sirenTriggered: false,
  playbackControls: null,
  midiMappings: {},
  columnOrder: [...DEFAULT_TRACK_TABLE_COLUMN_ORDER],
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

  setPlaybackControls: (controls) => set({ playbackControls: controls }),

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

  startMidiLearn: (control) => set({ midiLearningControl: control }),

  cancelMidiLearn: () => set({ midiLearningControl: null }),

  clearMidiMapping: (control) => {
    const mappings = { ...get().midiMappings }
    delete mappings[control]
    set({ midiMappings: mappings })
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
      const mappings = { ...get().midiMappings, [learning]: binding }
      set({ midiMappings: mappings, midiLearningControl: null })
      window.api.setMidiMappings(mappings).catch((err) => console.error('failed to save midi mappings', err))
      // Sync the LED to the control's current state right away, rather
      // than leaving it showing whatever it happened to be at (e.g. lit
      // from a previous binding) until the next toggle.
      const currentEffectsSettings = get().effectsSettings
      if (learning === 'delay.enabled') sendMidiFeedback(binding, currentEffectsSettings.delay.enabled)
      else if (learning === 'reverb.enabled') sendMidiFeedback(binding, currentEffectsSettings.reverb.enabled)
      else if (learning === 'filter.enabled') sendMidiFeedback(binding, currentEffectsSettings.filter.enabled)
      else if (learning === 'siren.enabled') sendMidiFeedback(binding, currentEffectsSettings.siren.enabled)
      return
    }

    const mappings = get().midiMappings
    const match = (Object.keys(mappings) as MidiControlKey[]).find((key) => {
      const binding = mappings[key]
      return binding && binding.channel === channel && binding.controller === controller
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

    const scaled = scaleMidiValue(match, value)
    if (match === 'volume') {
      get().setPlayerVolume(scaled)
      return
    }

    const effectsSettings = get().effectsSettings
    // delay.enabled/reverb.enabled are bound to a MIDI Mix mute-style
    // button, confirmed momentary (sends a nonzero message on press and a
    // 0 on release, rather than a hardware-latched on/off state) — mirroring
    // the raw value directly made the effect only stay on while physically
    // held. Toggle once on the press edge instead, and ignore the release
    // message entirely, so one tap flips the state and it stays there.
    if (match === 'delay.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        delay: { ...effectsSettings.delay, enabled: !effectsSettings.delay.enabled },
      })
    } else if (match === 'delay.timeMs') {
      get().setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, timeMs: scaled } })
    } else if (match === 'delay.feedback') {
      get().setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, feedback: scaled } })
    } else if (match === 'delay.mix') {
      get().setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, mix: scaled } })
    } else if (match === 'reverb.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        reverb: { ...effectsSettings.reverb, enabled: !effectsSettings.reverb.enabled },
      })
    } else if (match === 'reverb.mix') {
      get().setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, mix: scaled } })
    } else if (match === 'reverb.decaySeconds') {
      get().setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, decaySeconds: scaled } })
    } else if (match === 'reverb.preDelayMs') {
      get().setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, preDelayMs: scaled } })
    } else if (match === 'filter.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        filter: { ...effectsSettings.filter, enabled: !effectsSettings.filter.enabled },
      })
    } else if (match === 'filter.position') {
      get().setEffectsSettings({ ...effectsSettings, filter: { ...effectsSettings.filter, position: scaled } })
    } else if (match === 'filter.resonance') {
      get().setEffectsSettings({ ...effectsSettings, filter: { ...effectsSettings.filter, resonance: scaled } })
    } else if (match === 'siren.enabled') {
      if (value === 0) return
      get().setEffectsSettings({
        ...effectsSettings,
        siren: { ...effectsSettings.siren, enabled: !effectsSettings.siren.enabled },
      })
    } else if (match === 'siren.pitchHz') {
      get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, pitchHz: scaled } })
    } else if (match === 'siren.speedHz') {
      get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, speedHz: scaled } })
    } else if (match === 'siren.depth') {
      get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, depth: scaled } })
    } else if (match === 'siren.level') {
      get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, level: scaled } })
    } else if (match === 'siren.echoFeedback') {
      get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, echoFeedback: scaled } })
    }
  },

  loadCollectionFolder: async () => {
    const folder = await window.api.getCollectionFolder()
    set({ collectionFolder: folder })
  },

  pickCollectionFolder: async () => {
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
    const [tracks, genres, subgenres, moods, tagIdRows] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getMoods(),
      window.api.getAllTagIds(),
    ])
    const trackTags = new Map(tagIdRows.map((r) => [r.trackId, r]))
    set({ tracks, genres, subgenres, moods, trackTags, checkedTrackIds: new Set() })
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

  addManyToPlaylist: (trackIds) => {
    set({ playlist: addManyToPlaylistPure(get().playlist, trackIds) })
    triggerBackgroundAnalysisForMany(get, trackIds)
  },

  playNext: (trackId) => {
    set({ playlist: playNextPure(get().playlist, trackId) })
    triggerBackgroundAnalysis(get, trackId)
  },

  removeFromPlaylist: (index) => set({ playlist: removeFromPlaylistPure(get().playlist, index) }),

  movePlaylistItem: (fromIndex, toIndex) =>
    set({ playlist: movePlaylistItemPure(get().playlist, fromIndex, toIndex) }),

  advanceToNext: async () => {
    const before = get().playlist
    const after = advanceToNextPure(before)
    if (after === before) return
    set({ playlist: after })
    if (after.length > 0) await ensureTrackReady(set, get, after[0])
  },

  setContinuousPlay: (value) => set({ continuousPlay: value }),

  setPlayerExpanded: (value) => set({ playerExpanded: value }),

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

  setTrackMoods: async (trackId, moodIds) => {
    const updated = await window.api.setTrackMoods(trackId, moodIds)
    setTrackTags(set, get, updated)
  },

  setSearchText: (text) => set({ searchText: text, checkedTrackIds: new Set() }),

  runScan: async () => {
    await window.api.scanCollection()
    await get().loadAll()
  },

  // Progress is picked up via the existing scan:progress listener/
  // refreshTracks (wired once, globally, in App.tsx) — no separate
  // polling needed here.
  runAnalysis: async (trackIds) => {
    await window.api.analyzeCollection(trackIds)
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

  createMood: async (name) => {
    if (!name.trim()) return
    await window.api.createMood(name.trim())
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

  addTagsToCheckedTracks: async (tagIds) => {
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
