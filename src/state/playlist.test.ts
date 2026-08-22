import { describe, it, expect } from 'vitest'
import {
  playTrackNow,
  addToPlaylist,
  addManyToPlaylist,
  playNext,
  removeFromPlaylist,
  movePlaylistItem,
  advanceToNext,
} from './playlist'

describe('playTrackNow', () => {
  it('becomes the only entry when the queue is empty', () => {
    expect(playTrackNow([], 5)).toEqual([5])
  })

  it('replaces only the head, preserving the rest of the queue', () => {
    expect(playTrackNow([1, 2, 3], 99)).toEqual([99, 2, 3])
  })
})

describe('addToPlaylist', () => {
  it('appends to the end', () => {
    expect(addToPlaylist([1, 2], 5)).toEqual([1, 2, 5])
  })

  it('becomes the only entry when the queue is empty', () => {
    expect(addToPlaylist([], 5)).toEqual([5])
  })
})

describe('addManyToPlaylist', () => {
  it('appends every track to the end, preserving order', () => {
    expect(addManyToPlaylist([1, 2], [3, 4, 5])).toEqual([1, 2, 3, 4, 5])
  })

  it('becomes the queue when it was empty', () => {
    expect(addManyToPlaylist([], [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('is a no-op for an empty list of tracks to add', () => {
    expect(addManyToPlaylist([1, 2], [])).toEqual([1, 2])
  })
})

describe('playNext', () => {
  it('inserts right after the head', () => {
    expect(playNext([1, 2, 3], 99)).toEqual([1, 99, 2, 3])
  })

  it('becomes the head when the queue is empty', () => {
    expect(playNext([], 5)).toEqual([5])
  })
})

describe('removeFromPlaylist', () => {
  it('removes the row at the given index', () => {
    expect(removeFromPlaylist([1, 2, 3], 1)).toEqual([1, 3])
  })

  it('removing the head leaves the next track as the new head', () => {
    expect(removeFromPlaylist([1, 2, 3], 0)).toEqual([2, 3])
  })

  it('removing the only row empties the queue', () => {
    expect(removeFromPlaylist([1], 0)).toEqual([])
  })
})

describe('movePlaylistItem', () => {
  it('is a no-op when fromIndex equals toIndex', () => {
    const playlist = [1, 2, 3]
    expect(movePlaylistItem(playlist, 1, 1)).toBe(playlist)
  })

  it('moves an item to a later index', () => {
    expect(movePlaylistItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
  })

  it('moves an item to an earlier index', () => {
    expect(movePlaylistItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2])
  })
})

describe('advanceToNext', () => {
  it('dequeues the finished head track', () => {
    expect(advanceToNext([1, 2, 3])).toEqual([2, 3])
  })

  it('empties the queue when only one track was left', () => {
    expect(advanceToNext([1])).toEqual([])
  })

  it('returns the same array reference when already empty', () => {
    const playlist: number[] = []
    expect(advanceToNext(playlist)).toBe(playlist)
  })
})
