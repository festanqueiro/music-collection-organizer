import { describe, it, expect } from 'vitest'
import {
  playTrackNow,
  addToPlaylist,
  addManyToPlaylist,
  clearUpcoming,
  playNext,
  removeFromPlaylist,
  movePlaylistItem,
  advanceToNext,
  shufflePlaylist,
  playQueueItemNow,
  playQueueItemNext,
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

describe('shufflePlaylist', () => {
  it('returns the same array when there is nothing to reorder', () => {
    const empty: number[] = []
    const one = [1]
    const two = [1, 2]
    expect(shufflePlaylist(empty)).toBe(empty)
    expect(shufflePlaylist(one)).toBe(one)
    expect(shufflePlaylist(two)).toBe(two)
  })

  it('keeps the head in place and permutes the rest', () => {
    const result = shufflePlaylist([1, 2, 3, 4, 5], () => 0)
    expect(result[0]).toBe(1)
    expect(result).toEqual([1, 3, 4, 5, 2])
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('playQueueItemNow', () => {
  it('moves the entry to the head, replacing the current track, without duplicating it', () => {
    expect(playQueueItemNow([1, 2, 3, 4], 2)).toEqual([3, 2, 4])
  })

  it('is a no-op (same array) for the head or an out-of-range index', () => {
    const playlist = [1, 2, 3]
    expect(playQueueItemNow(playlist, 0)).toBe(playlist)
    expect(playQueueItemNow(playlist, 5)).toBe(playlist)
  })
})

describe('playQueueItemNext', () => {
  it('moves the entry to right after the current track', () => {
    expect(playQueueItemNext([1, 2, 3, 4], 3)).toEqual([1, 4, 2, 3])
  })

  it('is a no-op (same array) for the head, the entry already next, or an out-of-range index', () => {
    const playlist = [1, 2, 3]
    expect(playQueueItemNext(playlist, 0)).toBe(playlist)
    expect(playQueueItemNext(playlist, 1)).toBe(playlist)
    expect(playQueueItemNext(playlist, 9)).toBe(playlist)
  })
})

describe('clearUpcoming', () => {
  it('keeps only the current (head) track', () => {
    expect(clearUpcoming([5, 6, 7])).toEqual([5])
  })

  it('returns the same array when there is nothing after the head', () => {
    const one = [5]
    expect(clearUpcoming(one)).toBe(one)
    const empty: number[] = []
    expect(clearUpcoming(empty)).toBe(empty)
  })
})
