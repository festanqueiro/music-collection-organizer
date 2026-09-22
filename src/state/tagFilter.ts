export type TagFilterMode = 'AND' | 'OR'

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
  subgenreIdsByGenreId: Map<number, number[]>,
  mode: TagFilterMode = 'OR'
): boolean {
  if (filter.genreIds.size === 0 && filter.subgenreIds.size === 0) return true

  // A selected genre also counts as matched via any of its subgenres, same
  // as a direct tag on the genre itself — this holds in both AND and OR
  // mode, it's just what "this track is in the House checkbox" means.
  function genreMatches(genreId: number): boolean {
    if (track.genreIds.includes(genreId)) return true
    const impliedSubgenreIds = subgenreIdsByGenreId.get(genreId) ?? []
    return track.subgenreIds.some((id) => impliedSubgenreIds.includes(id))
  }
  function subgenreMatches(subgenreId: number): boolean {
    return track.subgenreIds.includes(subgenreId)
  }

  if (mode === 'AND') {
    return [...filter.genreIds].every(genreMatches) && [...filter.subgenreIds].every(subgenreMatches)
  }
  return [...filter.genreIds].some(genreMatches) || [...filter.subgenreIds].some(subgenreMatches)
}
