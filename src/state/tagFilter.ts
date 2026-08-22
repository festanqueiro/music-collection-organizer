export interface TagFilterState {
  genreIds: Set<number>
  subgenreIds: Set<number>
}

export interface TrackTagIds {
  trackId: number
  genreIds: number[]
  subgenreIds: number[]
}

export function matchesTagFilter(
  track: TrackTagIds,
  filter: TagFilterState,
  subgenreIdsByGenreId: Map<number, number[]>
): boolean {
  const genreBranchActive = filter.genreIds.size > 0 || filter.subgenreIds.size > 0

  if (genreBranchActive) {
    const directGenreMatch = track.genreIds.some((id) => filter.genreIds.has(id))

    const impliedSubgenreIds = new Set<number>()
    for (const genreId of filter.genreIds) {
      for (const subId of subgenreIdsByGenreId.get(genreId) ?? []) impliedSubgenreIds.add(subId)
    }
    const subgenreMatch = track.subgenreIds.some(
      (id) => filter.subgenreIds.has(id) || impliedSubgenreIds.has(id)
    )

    if (!directGenreMatch && !subgenreMatch) return false
  }

  return true
}
