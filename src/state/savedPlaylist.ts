// Editing a saved playlist's songs (docs/features/playlists.md, phase 3):
// the order arithmetic, kept pure so it's tested on its own. A playlist
// holds each song once, so songs are identified by track id.

// Moves `moving` (in the playlist's order, whatever order they're given in)
// before or after `targetId`. Dropping onto one of the moving songs leaves
// the order as it is.
export function moveTracksInPlaylist(
  order: number[],
  moving: number[],
  targetId: number,
  where: 'before' | 'after'
): number[] {
  const movingSet = new Set(moving.filter((id) => order.includes(id)))
  if (movingSet.size === 0 || movingSet.has(targetId) || !order.includes(targetId)) return order
  const moved = order.filter((id) => movingSet.has(id))
  const rest = order.filter((id) => !movingSet.has(id))
  const index = rest.indexOf(targetId) + (where === 'after' ? 1 : 0)
  return [...rest.slice(0, index), ...moved, ...rest.slice(index)]
}

// Undo for a removal: puts `removed` back where they were in `previous`,
// keeping whatever else changed in `current` since. Songs already back in
// the playlist aren't added twice.
export function restoreRemovedTracks(current: number[], previous: number[], removed: number[]): number[] {
  const removedSet = new Set(removed)
  const out = [...current]
  const present = new Set(current)
  previous.forEach((id, index) => {
    if (!removedSet.has(id) || present.has(id)) return
    out.splice(Math.min(index, out.length), 0, id)
    present.add(id)
  })
  return out
}
