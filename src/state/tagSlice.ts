// src/state/tagSlice.ts
//
// The store's Tags and Subtags (docs/features/tags.md): creating, renaming,
// colouring and deleting them with Undo, the checked rows and tagging them
// in bulk, and the tag data's export and import.

import type { StoreApi } from 'zustand'
import type { CollectionState } from './store'

type Set = StoreApi<CollectionState>['setState']
type Get = StoreApi<CollectionState>['getState']

// What this slice gives the store.
type TagSliceKeys =
  | 'createGenre'
  | 'createSubgenre'
  | 'renameGenre'
  | 'renameSubgenre'
  | 'setGenreColor'
  | 'setSubgenreColor'
  | 'deleteGenre'
  | 'undoGenreDeletion'
  | 'dismissGenreDeletionUndo'
  | 'deleteSubgenre'
  | 'undoSubgenreDeletion'
  | 'dismissSubgenreDeletionUndo'
  | 'toggleTrackChecked'
  | 'setTracksChecked'
  | 'clearCheckedTracks'
  | 'addTagsToCheckedTracks'
  | 'exportTagData'
  | 'importTagData'

export function createTagSlice(set: Set, get: Get): Pick<CollectionState, TagSliceKeys> {
  return {
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
  }
}
