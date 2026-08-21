// src/state/playlist.ts
//
// A FIFO play queue, not a persistent playlist: playlist[0] is whatever's
// currently playing (or about to), and once a track finishes it's dequeued
// entirely — it doesn't linger in the list. There's deliberately no
// separate "cursor" index: the head of the array IS the current track.
export type PlaylistState = number[]

// Replaces just the current (head) track, preserving everything queued
// after it. If the queue is empty, the track becomes the new head.
export function playTrackNow(playlist: PlaylistState, trackId: number): PlaylistState {
  if (playlist.length === 0) return [trackId]
  return [trackId, ...playlist.slice(1)]
}

// Appends to the end of the queue.
export function addToPlaylist(playlist: PlaylistState, trackId: number): PlaylistState {
  return [...playlist, trackId]
}

// Inserts immediately after the current (head) track — i.e. at index 1 —
// or as the new head if the queue is empty.
export function playNext(playlist: PlaylistState, trackId: number): PlaylistState {
  if (playlist.length === 0) return [trackId]
  return [playlist[0], trackId, ...playlist.slice(1)]
}

// Removes one row by index. No cursor bookkeeping needed — the head is
// always whatever ends up at index 0 afterward.
export function removeFromPlaylist(playlist: PlaylistState, index: number): PlaylistState {
  return playlist.filter((_, i) => i !== index)
}

// Drag-and-drop reorder.
export function movePlaylistItem(playlist: PlaylistState, fromIndex: number, toIndex: number): PlaylistState {
  if (fromIndex === toIndex) return playlist
  const next = [...playlist]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

// The current track finished — dequeue it. Returns the SAME array
// (reference-equal) when the queue is already empty, so callers can
// cheaply detect "nothing to advance to" via `result === playlist`.
export function advanceToNext(playlist: PlaylistState): PlaylistState {
  if (playlist.length === 0) return playlist
  return playlist.slice(1)
}
