// src/state/store.ts
import { create, type StoreApi } from 'zustand'
import type { Track, Genre, Subgenre, Mood } from '../types'
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
  searchText: string
  collectionFolder: string | null
  analysisProgress: { done: number; total: number } | null
  loadCollectionFolder: () => Promise<void>
  pickCollectionFolder: () => Promise<void>
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
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  genres: [],
  subgenres: [],
  moods: [],
  trackTags: new Map(),
  searchText: '',
  collectionFolder: null,
  analysisProgress: null,

  loadCollectionFolder: async () => {
    const folder = await window.api.getCollectionFolder()
    set({ collectionFolder: folder })
  },

  pickCollectionFolder: async () => {
    const folder = await window.api.chooseCollectionFolder()
    if (!folder) return
    set({ collectionFolder: folder })
    // Without this, switching folders leaves the previous folder's tracks
    // showing (and unplayable, since media:// is scoped to the new folder)
    // until the user happens to trigger a scan some other way.
    await get().runScan()
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
}))
