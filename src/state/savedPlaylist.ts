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

// Lower case, without accents, so "cafe" finds "Café".
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// The Playlists box's search: the ids of the nodes to show for `query`,
// or null when there's nothing to filter by. A node shows when its name
// has every word of the query, with the folders it sits in; a folder that
// matches shows everything in it.
export function filterPlaylistNodes(
  nodes: { id: number; parentId: number | null; name: string }[],
  query: string
): Set<number> | null {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const matches = new Set(nodes.filter((n) => words.every((w) => fold(n.name).includes(w))).map((n) => n.id))
  const visible = new Set<number>()
  for (const node of nodes) {
    // Guarded against a parent loop, which the DB shouldn't hold.
    const chain: number[] = []
    for (let n: typeof node | undefined = node; n && !chain.includes(n.id); n = n.parentId === null ? undefined : byId.get(n.parentId)) {
      chain.push(n.id)
    }
    if (matches.has(node.id)) chain.forEach((id) => visible.add(id))
    else if (chain.some((id) => matches.has(id))) visible.add(node.id)
  }
  return visible
}

// The names of the folders a playlist or folder sits in, outermost first
// ("Sets", "2026") — empty at the top level. Stops at a parent loop, which
// the DB shouldn't hold.
export function playlistFolders(
  node: { parentId: number | null },
  byId: ReadonlyMap<number, { name: string; parentId: number | null }>
): string[] {
  const names: string[] = []
  const seen = new Set<number>()
  for (let p = node.parentId; p !== null && !seen.has(p); p = byId.get(p)?.parentId ?? null) {
    seen.add(p)
    names.unshift(byId.get(p)?.name ?? '')
  }
  return names
}
