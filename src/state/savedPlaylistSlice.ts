// src/state/savedPlaylistSlice.ts
//
// The store's saved playlists (docs/features/playlists.md) — "saved"
// because `playlist` in the store is the queue: the tree, the playlist
// being viewed and its songs, adding, removing and reordering with Undo,
// and playing a playlist or folder (which replaces the queue, with Undo).
import { moveTracksInPlaylist, restoreOrder, restoreRemovedTracks } from './savedPlaylist'
import { harmonicChanges, orderByHarmonicMixing } from './harmonicOrder'
import type { StoreApi } from 'zustand'
import type { CollectionState } from './store'
import { downloadBeforePlaying, newPlayRequest, prefetchUpcoming, triggerBackgroundAnalysisForMany } from './playbackHelpers'
import { writeStored } from './stored'

// The Undo toasts' timers.
let queueUndoTimeout: ReturnType<typeof setTimeout> | null = null
let playlistUndoTimeout: ReturnType<typeof setTimeout> | null = null
// The playlist `selectedPlaylistTrackIds` are the songs of. For a moment
// after another playlist is picked they are still the last one's, until
// the new one's arrive: an action that rewrites a playlist's order must not
// write those into the new playlist.
let listedPlaylistId: number | null = null

// Playlists songs were last added to, newest first — Add to playlist lists
// them on top. Per-viewer convenience, so localStorage (may be missing in
// tests, or throw).
const RECENT_PLAYLISTS_KEY = 'recentPlaylists'
function loadRecentPlaylistIds(): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_PLAYLISTS_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : []
  } catch {
    return []
  }
}
function saveRecentPlaylistIds(ids: number[]): void {
  writeStored(RECENT_PLAYLISTS_KEY, JSON.stringify(ids))
}

type Set = StoreApi<CollectionState>['setState']
type Get = StoreApi<CollectionState>['getState']

// What this slice gives the store.
type SavedPlaylistSliceKeys =
  | 'playlistNodes'
  | 'selectedPlaylistId'
  | 'selectedPlaylistTrackIds'
  | 'recentPlaylistIds'
  | 'loadPlaylists'
  | 'selectPlaylist'
  | 'createPlaylistNode'
  | 'renamePlaylistNode'
  | 'deletePlaylistNode'
  | 'addTracksToSavedPlaylist'
  | 'removeTracksFromSelectedPlaylist'
  | 'moveTracksInSelectedPlaylist'
  | 'orderSelectedPlaylistByKey'
  | 'playlistUndo'
  | 'undoPlaylistRemove'
  | 'dismissPlaylistUndo'
  | 'playPlaylistNode'
  | 'queueUndo'
  | 'undoQueueReplace'
  | 'dismissQueueUndo'

export function createSavedPlaylistSlice(set: Set, get: Get): Pick<CollectionState, SavedPlaylistSliceKeys> {
  return {
    playlistNodes: [],
    selectedPlaylistId: null,
    selectedPlaylistTrackIds: [],
    recentPlaylistIds: loadRecentPlaylistIds(),
    loadPlaylists: async () => set({ playlistNodes: await window.api.getPlaylistNodes() }),
    selectPlaylist: async (id) => {
      if (id === null) {
        listedPlaylistId = null
        return set({ selectedPlaylistId: null, selectedPlaylistTrackIds: [] })
      }
      // Another playlist: its songs aren't here yet, and the last one's
      // aren't its. (The same one read again keeps its list meanwhile.)
      if (get().selectedPlaylistId !== id) {
        listedPlaylistId = null
        set({ selectedPlaylistId: id, selectedPlaylistTrackIds: [] })
      }
      const trackIds = await window.api.getPlaylistTrackIds(id)
      // Another playlist may have been picked meanwhile.
      if (get().selectedPlaylistId !== id) return
      listedPlaylistId = id
      set({ selectedPlaylistTrackIds: trackIds })
    },
    createPlaylistNode: async (kind, name, parentId) => {
      const { id, nodes } = await window.api.createPlaylistNode(kind, name, parentId)
      set({ playlistNodes: nodes })
      return id
    },
    renamePlaylistNode: async (id, name) => set({ playlistNodes: await window.api.renamePlaylistNode(id, name) }),
    deletePlaylistNode: async (id) => {
      const nodes = await window.api.deletePlaylistNode(id)
      set({ playlistNodes: nodes })
      const selected = get().selectedPlaylistId
      if (selected !== null && !nodes.some((n) => n.id === selected)) set({ selectedPlaylistId: null, selectedPlaylistTrackIds: [] })
    },
    addTracksToSavedPlaylist: async (playlistId, trackIds) => {
      if (trackIds.length === 0) return
      const result = await window.api.addTracksToPlaylist(playlistId, trackIds)
      const recentPlaylistIds = [playlistId, ...get().recentPlaylistIds.filter((id) => id !== playlistId)].slice(0, 10)
      saveRecentPlaylistIds(recentPlaylistIds)
      set({ playlistNodes: result.nodes, recentPlaylistIds })
      if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: result.trackIds })
      const name = result.nodes.find((n) => n.id === playlistId)?.name ?? 'the playlist'
      const songs = (n: number) => `${n} song${n === 1 ? '' : 's'}`
      get().showToast(
        result.added === 0
          ? `Already in ${name}`
          : `Added ${songs(result.added)} to ${name}${result.skipped > 0 ? ` (${result.skipped} already in it)` : ''}`
      )
    },
    removeTracksFromSelectedPlaylist: async (trackIds) => {
      const playlistId = get().selectedPlaylistId
      if (playlistId === null || trackIds.length === 0) return
      const previous = get().selectedPlaylistTrackIds
      const result = await window.api.removeTracksFromPlaylist(playlistId, trackIds)
      set({ playlistNodes: result.nodes })
      if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: result.trackIds })
      const removed = previous.filter((id) => !result.trackIds.includes(id))
      if (removed.length === 0) return
      const name = result.nodes.find((n) => n.id === playlistId)?.name ?? 'the playlist'
      // One undo at a time at the bottom of the window.
      get().dismissQueueUndo()
      get().dismissCueUndo()
      if (playlistUndoTimeout) clearTimeout(playlistUndoTimeout)
      set({
        playlistUndo: {
          message: `Removed ${removed.length} song${removed.length === 1 ? '' : 's'} from ${name}`,
          playlistId,
          previous,
          removed,
        },
      })
      playlistUndoTimeout = setTimeout(() => set({ playlistUndo: null }), 8000)
    },
    moveTracksInSelectedPlaylist: async (trackIds, targetId, where) => {
      const playlistId = get().selectedPlaylistId
      if (playlistId === null || listedPlaylistId !== playlistId) return
      const before = get().selectedPlaylistTrackIds
      const order = moveTracksInPlaylist(before, trackIds, targetId, where)
      if (order === before) return
      // An Undo of an ordering puts the whole old order back: after a drag
      // it would throw the drag away, so it is no longer offered. (An Undo
      // of a removal only puts the songs back in, and stays.)
      const undo = get().playlistUndo
      if (undo && undo.playlistId === playlistId && undo.removed.length === 0) get().dismissPlaylistUndo()
      // Shown at once; the write follows.
      set({ selectedPlaylistTrackIds: order })
      try {
        const result = await window.api.setPlaylistTrackIds(playlistId, order)
        set({ playlistNodes: result.nodes })
        if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: result.trackIds })
      } catch (err) {
        if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: before })
        get().showToast(`Couldn't reorder: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    orderSelectedPlaylistByKey: async () => {
      const playlistId = get().selectedPlaylistId
      if (playlistId === null || listedPlaylistId !== playlistId) return
      const before = get().selectedPlaylistTrackIds
      const byId = new Map(get().tracks.map((t) => [t.id, t]))
      // A song whose file is gone has no key here: it goes last with the others that have none.
      const keyed = (ids: number[]) => ids.map((id) => ({ id, musicalKey: byId.get(id)?.musicalKey ?? null, bpm: byId.get(id)?.bpm ?? null }))
      if (!keyed(before).some((t) => t.musicalKey)) return get().showToast('No song here has a key yet — analyse them first')
      const order = orderByHarmonicMixing(keyed(before))
      const { inKey, total } = harmonicChanges(keyed(order))
      const summary = `${inKey} of ${total} key change${total === 1 ? '' : 's'} mix harmonically`
      if (order.every((id, i) => id === before[i])) return get().showToast(`Already in harmonic order: ${summary}`)
      set({ selectedPlaylistTrackIds: order })
      try {
        const result = await window.api.setPlaylistTrackIds(playlistId, order)
        set({ playlistNodes: result.nodes })
        if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: result.trackIds })
      } catch (err) {
        if (get().selectedPlaylistId === playlistId) set({ selectedPlaylistTrackIds: before })
        return get().showToast(`Couldn't reorder: ${err instanceof Error ? err.message : String(err)}`)
      }
      get().dismissQueueUndo()
      get().dismissCueUndo()
      if (playlistUndoTimeout) clearTimeout(playlistUndoTimeout)
      set({ playlistUndo: { message: `Ordered by harmonic mixing: ${summary}`, playlistId, previous: before, removed: [] } })
      playlistUndoTimeout = setTimeout(() => set({ playlistUndo: null }), 8000)
    },
    playlistUndo: null,
    undoPlaylistRemove: async () => {
      const undo = get().playlistUndo
      get().dismissPlaylistUndo()
      if (!undo) return
      const current = await window.api.getPlaylistTrackIds(undo.playlistId)
      const result = await window.api.setPlaylistTrackIds(
        undo.playlistId,
        undo.removed.length === 0 ? restoreOrder(current, undo.previous) : restoreRemovedTracks(current, undo.previous, undo.removed)
      )
      set({ playlistNodes: result.nodes })
      if (get().selectedPlaylistId === undo.playlistId) set({ selectedPlaylistTrackIds: result.trackIds })
    },
    dismissPlaylistUndo: () => {
      if (playlistUndoTimeout) clearTimeout(playlistUndoTimeout)
      set({ playlistUndo: null })
    },
    playPlaylistNode: async (id) => {
      const node = get().playlistNodes.find((n) => n.id === id)
      // Songs whose file is gone can't play; they stay in the playlist.
      const present = new Set(get().tracks.map((t) => t.id))
      const ids = (await window.api.getPlaylistNodeTrackIds(id)).filter((trackId) => present.has(trackId))
      if (ids.length === 0) return get().showToast(`Nothing to play in ${node?.name ?? 'it'}`)
      const stillWanted = newPlayRequest()
      if (!(await downloadBeforePlaying(get, ids[0]))) return
      if (!stillWanted()) return
      const previous = get().playlist
      set({ playlist: ids })
      triggerBackgroundAnalysisForMany(get, ids)
      prefetchUpcoming(get)
      const message = `Playing ${node?.name ?? 'the playlist'} — ${ids.length} song${ids.length === 1 ? '' : 's'}`
      // Only worth an undo if there was a queue to lose.
      if (previous.length > 1) {
        if (queueUndoTimeout) clearTimeout(queueUndoTimeout)
        get().dismissPlaylistUndo()
        get().dismissCueUndo()
        set({ queueUndo: { message, previous } })
        queueUndoTimeout = setTimeout(() => set({ queueUndo: null }), 8000)
      } else get().showToast(message)
    },
    queueUndo: null,
    undoQueueReplace: () => {
      const undo = get().queueUndo
      if (queueUndoTimeout) clearTimeout(queueUndoTimeout)
      set({ queueUndo: null })
      if (undo) set({ playlist: undo.previous })
    },
    dismissQueueUndo: () => {
      if (queueUndoTimeout) clearTimeout(queueUndoTimeout)
      set({ queueUndo: null })
    },
  }
}
