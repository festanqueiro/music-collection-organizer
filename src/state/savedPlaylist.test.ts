import { describe, it, expect } from 'vitest'
import { moveTracksInPlaylist, restoreRemovedTracks } from './savedPlaylist'

describe('moveTracksInPlaylist', () => {
  const order = [1, 2, 3, 4, 5]

  it('moves one song down, before or after the target', () => {
    expect(moveTracksInPlaylist(order, [1], 4, 'before')).toEqual([2, 3, 1, 4, 5])
    expect(moveTracksInPlaylist(order, [1], 4, 'after')).toEqual([2, 3, 4, 1, 5])
  })

  it('moves one song up', () => {
    expect(moveTracksInPlaylist(order, [5], 2, 'before')).toEqual([1, 5, 2, 3, 4])
    expect(moveTracksInPlaylist(order, [5], 1, 'before')).toEqual([5, 1, 2, 3, 4])
  })

  it('moves to the very end', () => {
    expect(moveTracksInPlaylist(order, [2], 5, 'after')).toEqual([1, 3, 4, 5, 2])
  })

  it('moves several together, keeping their playlist order', () => {
    expect(moveTracksInPlaylist(order, [4, 1], 3, 'after')).toEqual([2, 3, 1, 4, 5])
    expect(moveTracksInPlaylist(order, [5, 2], 1, 'before')).toEqual([2, 5, 1, 3, 4])
  })

  it('does nothing when dropped on a song being moved', () => {
    expect(moveTracksInPlaylist(order, [2, 3], 3, 'after')).toBe(order)
  })

  it('ignores songs that are not in the playlist', () => {
    expect(moveTracksInPlaylist(order, [9], 3, 'after')).toBe(order)
    expect(moveTracksInPlaylist(order, [9, 1], 3, 'after')).toEqual([2, 3, 1, 4, 5])
    expect(moveTracksInPlaylist(order, [1], 9, 'after')).toBe(order)
  })
})

describe('restoreRemovedTracks', () => {
  it('puts removed songs back in the same places', () => {
    expect(restoreRemovedTracks([1, 3, 5], [1, 2, 3, 4, 5], [2, 4])).toEqual([1, 2, 3, 4, 5])
    expect(restoreRemovedTracks([2, 3], [1, 2, 3, 4], [1, 4])).toEqual([1, 2, 3, 4])
  })

  it('restores everything when the playlist was emptied', () => {
    expect(restoreRemovedTracks([], [1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('keeps songs added since, and does not duplicate ones already back', () => {
    expect(restoreRemovedTracks([1, 3, 9], [1, 2, 3], [2])).toEqual([1, 2, 3, 9])
    expect(restoreRemovedTracks([1, 2, 3], [1, 2, 3], [2])).toEqual([1, 2, 3])
  })

  it('clamps to the end when the playlist got shorter', () => {
    expect(restoreRemovedTracks([1], [1, 2, 3, 4], [4])).toEqual([1, 4])
  })
})
