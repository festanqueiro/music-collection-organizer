// src/state/cueSlice.ts
//
// The store's hot cues and per-track waveforms (docs/features/hot-cues.md,
// player.md): read per track, patched from what the main process returns,
// with Undo for a deleted hot cue, and the waveform's style and bar lines.
import { HOT_CUE_LETTERS } from './hotCues'
import { writeStored } from './stored'
import type { StoreApi } from 'zustand'
import type { CollectionState } from './store'
import { WAVEFORM_STYLES } from '../types'
import type { TrackCue, WaveformStyle } from '../types'
import { readStoredFlag } from './stored'

let cueUndoTimeout: ReturnType<typeof setTimeout> | null = null

// A track's cues after a write (the IPC returns them), into the store.
function patchCues(
  set: StoreApi<CollectionState>['setState'],
  get: StoreApi<CollectionState>['getState'],
  trackId: number,
  cues: TrackCue[]
): void {
  const hot = cues.filter((c) => c.kind === 'hot').length
  const counts = { ...get().hotCueCounts }
  if (hot) counts[trackId] = hot
  else delete counts[trackId]
  set({ trackCues: new Map(get().trackCues).set(trackId, cues), hotCueCounts: counts })
}

// The player's waveform: its style and its bar lines (per computer).
const WAVEFORM_STYLE_KEY = 'waveformStyle'
function loadWaveformStyle(): WaveformStyle {
  try {
    const stored = localStorage.getItem(WAVEFORM_STYLE_KEY) as WaveformStyle | null
    return stored && WAVEFORM_STYLES.includes(stored) ? stored : 'classic'
  } catch {
    return 'classic'
  }
}
const WAVEFORM_GRID_KEY = 'waveformGrid'
const loadWaveformGrid = (): boolean => readStoredFlag(WAVEFORM_GRID_KEY, true)

type Set = StoreApi<CollectionState>['setState']
type Get = StoreApi<CollectionState>['getState']

// What this slice gives the store.
type CueSliceKeys =
  | 'trackCues'
  | 'hotCueCounts'
  | 'loadTrackCues'
  | 'refreshHotCueCounts'
  | 'trackWaveforms'
  | 'trackWaveformBands'
  | 'loadTrackWaveformBands'
  | 'waveformStyle'
  | 'setWaveformStyle'
  | 'waveformGrid'
  | 'setWaveformGrid'
  | 'loadTrackWaveform'
  | 'setHotCue'
  | 'updateHotCue'
  | 'deleteHotCue'
  | 'removeHotCue'
  | 'cueUndo'
  | 'undoCueRemove'
  | 'dismissCueUndo'

export function createCueSlice(set: Set, get: Get): Pick<CollectionState, CueSliceKeys> {
  return {
    trackCues: new Map(),
    hotCueCounts: {},
    loadTrackCues: async (trackId) => {
      const cues = await window.api.getTrackCues(trackId)
      set({ trackCues: new Map(get().trackCues).set(trackId, cues) })
      return cues
    },
    refreshHotCueCounts: async () => set({ hotCueCounts: await window.api.getHotCueCounts() }),
    trackWaveforms: new Map(),
    trackWaveformBands: new Map(),
    loadTrackWaveformBands: async (trackId) => {
      const bands = await window.api.getTrackWaveformBands(trackId)
      const trackWaveformBands = new Map(get().trackWaveformBands)
      if (bands) trackWaveformBands.set(trackId, bands)
      else if (!trackWaveformBands.delete(trackId)) return
      set({ trackWaveformBands })
    },
    waveformStyle: loadWaveformStyle(),
    setWaveformStyle: (style) => {
      set({ waveformStyle: style })
      writeStored(WAVEFORM_STYLE_KEY, style)
    },
    waveformGrid: loadWaveformGrid(),
    setWaveformGrid: (show) => {
      set({ waveformGrid: show })
      writeStored(WAVEFORM_GRID_KEY, String(show))
    },
    loadTrackWaveform: async (trackId) => {
      const peaks = await window.api.getTrackWaveform(trackId)
      const trackWaveforms = new Map(get().trackWaveforms)
      if (peaks) trackWaveforms.set(trackId, peaks)
      else if (!trackWaveforms.delete(trackId)) return
      set({ trackWaveforms })
    },
    setHotCue: async (trackId, slot, start) => patchCues(set, get, trackId, await window.api.setHotCue(trackId, slot, start)),
    updateHotCue: async (trackId, slot, changes) => patchCues(set, get, trackId, await window.api.updateHotCue(trackId, slot, changes)),
    deleteHotCue: async (trackId, slot) => patchCues(set, get, trackId, await window.api.deleteHotCue(trackId, slot)),
    removeHotCue: async (trackId, slot) => {
      const cue = (get().trackCues.get(trackId) ?? []).find((c) => c.kind === 'hot' && c.slot === slot)
      await get().deleteHotCue(trackId, slot)
      if (!cue) return
      // One undo at a time at the bottom of the window.
      get().dismissQueueUndo()
      get().dismissPlaylistUndo()
      if (cueUndoTimeout) clearTimeout(cueUndoTimeout)
      set({ cueUndo: { message: `Deleted hot cue ${HOT_CUE_LETTERS[slot] ?? ''}${cue.name ? ` — ${cue.name}` : ''}`, trackId, cue } })
      cueUndoTimeout = setTimeout(() => set({ cueUndo: null }), 8000)
    },
    cueUndo: null,
    undoCueRemove: async () => {
      const undo = get().cueUndo
      get().dismissCueUndo()
      if (!undo) return
      const { trackId, cue } = undo
      // Not over a cue set on that pad since.
      if ((get().trackCues.get(trackId) ?? []).some((c) => c.kind === 'hot' && c.slot === cue.slot)) {
        get().showToast(`Pad ${HOT_CUE_LETTERS[cue.slot] ?? ''} has a new cue: the deleted one wasn't put back`)
        return
      }
      await get().setHotCue(trackId, cue.slot, cue.start)
      if (cue.color || cue.name) await get().updateHotCue(trackId, cue.slot, { color: cue.color, name: cue.name })
    },
    dismissCueUndo: () => {
      if (cueUndoTimeout) clearTimeout(cueUndoTimeout)
      set({ cueUndo: null })
    },
  }
}
