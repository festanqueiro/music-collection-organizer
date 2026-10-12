import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Track } from '../types'

// The store is the renderer's: `window.api` stubbed with the playlist
// calls these actions make, before the module builds its store.
const stored = { ids: [] as number[] }
const api = {
  setPlaylistTrackIds: vi.fn(async (_id: number, ids: number[]) => {
    stored.ids = ids
    return { nodes: [], trackIds: ids }
  }),
  getPlaylistTrackIds: vi.fn(async () => stored.ids),
}
;(globalThis as unknown as { window: unknown }).window = { api }

const { useCollectionStore } = await import('./store')

const track = (id: number, musicalKey: string | null, bpm: number | null = null) => ({ id, musicalKey, bpm }) as Track
// 8A, 9A, 10A on the Camelot wheel.
const A_MINOR = 'A minor'
const E_MINOR = 'E minor'
const B_MINOR = 'B minor'

describe('Order by Harmonic Mixing, in the store', () => {
  beforeEach(async () => {
    stored.ids = [1, 2, 3]
    api.setPlaylistTrackIds.mockClear()
    useCollectionStore.getState().dismissPlaylistUndo()
    useCollectionStore.setState({ tracks: [track(1, B_MINOR), track(2, A_MINOR), track(3, E_MINOR)] })
    await useCollectionStore.getState().selectPlaylist(null)
    await useCollectionStore.getState().selectPlaylist(7)
  })

  it('writes the new order to the playlist and offers Undo with the old one', async () => {
    await useCollectionStore.getState().orderSelectedPlaylistByKey()
    expect(api.setPlaylistTrackIds).toHaveBeenCalledWith(7, [2, 3, 1])
    expect(useCollectionStore.getState().selectedPlaylistTrackIds).toEqual([2, 3, 1])
    const undo = useCollectionStore.getState().playlistUndo
    expect(undo?.previous).toEqual([1, 2, 3])
    expect(undo?.message).toContain('2 of 2 key changes mix harmonically')

    await useCollectionStore.getState().undoPlaylistRemove()
    expect(stored.ids).toEqual([1, 2, 3])
    expect(useCollectionStore.getState().selectedPlaylistTrackIds).toEqual([1, 2, 3])
  })

  it('writes nothing when the order is already harmonic, or no song has a key', async () => {
    useCollectionStore.setState({ selectedPlaylistTrackIds: [2, 3, 1] })
    await useCollectionStore.getState().orderSelectedPlaylistByKey()
    useCollectionStore.setState({ tracks: [track(1, null), track(2, null), track(3, null)] })
    await useCollectionStore.getState().orderSelectedPlaylistByKey()
    expect(api.setPlaylistTrackIds).not.toHaveBeenCalled()
    expect(useCollectionStore.getState().playlistUndo).toBeNull()
  })

  it('no longer offers that Undo once a song has been dragged: it would throw the drag away', async () => {
    await useCollectionStore.getState().orderSelectedPlaylistByKey()
    await useCollectionStore.getState().moveTracksInSelectedPlaylist([1], 2, 'before')
    expect(useCollectionStore.getState().selectedPlaylistTrackIds).toEqual([1, 2, 3])
    expect(useCollectionStore.getState().playlistUndo).toBeNull()
  })

  it("never writes one playlist's songs into the playlist picked next, before its own have arrived", async () => {
    // Playlist 8's songs are on their way; 7's must not be written to it.
    let arrive: (ids: number[]) => void = () => {}
    api.getPlaylistTrackIds.mockImplementationOnce(() => new Promise<number[]>((resolve) => (arrive = resolve)))
    const picking = useCollectionStore.getState().selectPlaylist(8)
    expect(useCollectionStore.getState().selectedPlaylistTrackIds).toEqual([])

    await useCollectionStore.getState().orderSelectedPlaylistByKey()
    await useCollectionStore.getState().moveTracksInSelectedPlaylist([1], 2, 'before')
    expect(api.setPlaylistTrackIds).not.toHaveBeenCalled()

    arrive([3, 2])
    await picking
    expect(useCollectionStore.getState().selectedPlaylistTrackIds).toEqual([3, 2])
  })
})
