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

export interface TagTrackCounts {
  genres: Map<number, number>
  subgenres: Map<number, number>
  // Per subtag, the tracks that have it together with each tag.
  genresWithSubgenre: Map<number, Map<number, number>>
}

// How many of the given tracks each tag and subtag would list when ticked:
// a tag counts the tracks that have it or one of its subtags, as the
// filter does. Only the tracks passed in count (the collection's, not
// tags left on a missing file).
export function countTracksByTag(
  trackIds: Iterable<number>,
  trackTags: Map<number, TrackTagIds>,
  subgenres: { id: number; genreId: number }[]
): TagTrackCounts {
  const genreIdBySubgenreId = new Map(subgenres.map((sg) => [sg.id, sg.genreId]))
  const counts: TagTrackCounts = { genres: new Map(), subgenres: new Map(), genresWithSubgenre: new Map() }
  const add = (map: Map<number, number>, id: number) => map.set(id, (map.get(id) ?? 0) + 1)
  for (const trackId of trackIds) {
    const tags = trackTags.get(trackId)
    if (!tags) continue
    const genreIds = new Set(tags.genreIds)
    for (const subgenreId of new Set(tags.subgenreIds)) {
      add(counts.subgenres, subgenreId)
      if (!counts.genresWithSubgenre.has(subgenreId)) counts.genresWithSubgenre.set(subgenreId, new Map())
      for (const genreId of genreIds) add(counts.genresWithSubgenre.get(subgenreId)!, genreId)
    }
    // After the pairs above: a tag implied by a subtag counts for the tag's
    // own row, not as a tag the track carries with the subtag.
    for (const subgenreId of tags.subgenreIds) {
      const parent = genreIdBySubgenreId.get(subgenreId)
      if (parent !== undefined) genreIds.add(parent)
    }
    for (const genreId of genreIds) add(counts.genres, genreId)
  }
  return counts
}
