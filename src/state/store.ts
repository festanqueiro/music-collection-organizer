// src/state/store.ts
import { create, type StoreApi } from 'zustand'
import type { Track, Genre, Subgenre, Mood, ImportResult, GenreDeletionSnapshot } from '../types'
import type { TrackTagIds } from './tagFilter'

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

interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  moods: Mood[]
  trackTags: Map<number, TrackTagIds>
  checkedTrackIds: Set<number>
  pendingGenreDeletion: { snapshot: GenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
  searchText: string
  collectionFolder: string | null
  analysisProgress: { done: number; total: number } | null
  loadCollectionFolder: () => Promise<void>
  pickCollectionFolder: () => Promise<boolean>
  loadAll: () => Promise<void>
  setAnalysisProgress: (progress: { done: number; total: number } | null) => void
  refreshTracks: () => Promise<void>
  setTrackGenres: (trackId: number, genreIds: number[]) => Promise<void>
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) => Promise<void>
  setTrackMoods: (trackId: number, moodIds: number[]) => Promise<void>
  setSearchText: (text: string) => void
  runScan: () => Promise<void>
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
  searchText: '',
  collectionFolder: null,
  analysisProgress: null,

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
    set({ tracks, genres, subgenres, moods, trackTags })
  },

  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

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

  setSearchText: (text) => set({ searchText: text }),

  runScan: async () => {
    await window.api.scanCollection()
    await get().loadAll()
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
    set({ pendingGenreDeletion: null })
    await window.api.undoDeleteGenre(pending.snapshot)
    await get().loadAll()
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
