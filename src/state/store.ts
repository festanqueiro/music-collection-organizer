// src/state/store.ts
import { create } from 'zustand'
import type { Track, Genre, Subgenre, Mood } from '../types'

interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  moods: Mood[]
  loadAll: () => Promise<void>
  setTrackGenres: (trackId: number, genreIds: number[]) => Promise<void>
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) => Promise<void>
  setTrackMoods: (trackId: number, moodIds: number[]) => Promise<void>
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  genres: [],
  subgenres: [],
  moods: [],

  loadAll: async () => {
    const [tracks, genres, subgenres, moods] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getMoods(),
    ])
    set({ tracks, genres, subgenres, moods })
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
}))
