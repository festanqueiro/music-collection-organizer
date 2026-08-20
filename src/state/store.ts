// src/state/store.ts
import { create } from 'zustand'
import type { Track, Genre, Subgenre, Mood } from '../types'
import type { TrackTagIds } from './tagFilter'

interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  moods: Mood[]
  trackTags: Map<number, TrackTagIds>
  searchText: string
  collectionFolder: string | null
  loadCollectionFolder: () => Promise<void>
  pickCollectionFolder: () => Promise<void>
  loadAll: () => Promise<void>
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

  loadCollectionFolder: async () => {
    const folder = await window.api.getCollectionFolder()
    set({ collectionFolder: folder })
  },

  pickCollectionFolder: async () => {
    const folder = await window.api.chooseCollectionFolder()
    if (folder) set({ collectionFolder: folder })
  },

  loadAll: async () => {
    const [tracks, genres, subgenres, moods, tagIdRows] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getMoods(),
      window.api.getAllTagIds(),
    ])
    const trackTags = new Map(tagIdRows.map((r: any) => [r.trackId, r]))
    set({ tracks, genres, subgenres, moods, trackTags })
  },

  setTrackGenres: async (trackId, genreIds) => {
    await window.api.setTrackGenres(trackId, genreIds)
    await get().loadAll()
  },

  setTrackSubgenres: async (trackId, subgenreIds) => {
    await window.api.setTrackSubgenres(trackId, subgenreIds)
    await get().loadAll()
  },

  setTrackMoods: async (trackId, moodIds) => {
    await window.api.setTrackMoods(trackId, moodIds)
    await get().loadAll()
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
