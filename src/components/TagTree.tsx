import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { matchesTagFilter, type TagFilterState } from '../state/tagFilter'
import type { Track } from '../types'

// Drops any id from `ids` that no longer exists in `existing` — e.g. after
// deleteGenre removes a genre out from under a still-checked checkbox, so
// the filter doesn't keep matching against an id nothing has anymore
// (which would otherwise make the track list go silently empty).
function intersectWithExisting(ids: Set<number>, existing: { id: number }[]): Set<number> {
  const existingIds = new Set(existing.map((x) => x.id))
  return new Set([...ids].filter((id) => existingIds.has(id)))
}

export function TagTree({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const deleteGenre = useCollectionStore((s) => s.deleteGenre)

  const [genreIds, setGenreIds] = useState<Set<number>>(new Set())
  const [subgenreIds, setSubgenreIds] = useState<Set<number>>(new Set())
  const [moodIds, setMoodIds] = useState<Set<number>>(new Set())

  const subgenreIdsByGenreId = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const sg of subgenres) {
      if (!map.has(sg.genreId)) map.set(sg.genreId, [])
      map.get(sg.genreId)!.push(sg.id)
    }
    return map
  }, [subgenres])

  function applyFilter(next: TagFilterState) {
    onFilterChange((track: Track) => {
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [], moodIds: [] }
      return matchesTagFilter(tags, next, subgenreIdsByGenreId)
    })
  }

  // A checkbox toggle rebuilds the filter closure over trackTags as it was
  // at that moment — if a tag edit elsewhere changes trackTags afterward
  // without the user touching a checkbox, the stored filter closure goes
  // stale (it still matches against the old trackTags). Re-applying the
  // current filter selection whenever trackTags (or the genre/subgenre
  // lists themselves, e.g. after a delete) changes keeps it live.
  useEffect(() => {
    applyFilter({
      genreIds: intersectWithExisting(genreIds, genres),
      subgenreIds: intersectWithExisting(subgenreIds, subgenres),
      moodIds,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackTags, genres, subgenres])

  function toggle(set: Set<number>, id: number, setter: (s: Set<number>) => void, key: 'genre' | 'subgenre' | 'mood') {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
    const filterState: TagFilterState = {
      genreIds: intersectWithExisting(key === 'genre' ? next : genreIds, genres),
      subgenreIds: intersectWithExisting(key === 'subgenre' ? next : subgenreIds, subgenres),
      moodIds: key === 'mood' ? next : moodIds,
    }
    applyFilter(filterState)
  }

  return (
    <div>
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Genre</div>
      {genres.map((genre) => (
        <div key={genre.id}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
            <input
              type="checkbox"
              checked={genreIds.has(genre.id)}
              onChange={() => toggle(genreIds, genre.id, setGenreIds, 'genre')}
            />{' '}
            <span style={{ flex: 1 }}>{genre.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`Delete genre "${genre.name}"? This also removes its sub-genres and untags every track that has it.`)) {
                  deleteGenre(genre.id)
                }
              }}
              title={`Delete genre "${genre.name}"`}
              style={{ padding: '0 4px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                delete
              </span>
            </button>
          </label>
          {subgenres
            .filter((sg) => sg.genreId === genre.id)
            .map((sg) => (
              <label key={sg.id} style={{ display: 'block', paddingLeft: '24px' }}>
                <input
                  type="checkbox"
                  checked={subgenreIds.has(sg.id)}
                  onChange={() => toggle(subgenreIds, sg.id, setSubgenreIds, 'subgenre')}
                />{' '}
                {sg.name}
              </label>
            ))}
        </div>
      ))}
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Mood</div>
      {moods.map((mood) => (
        <label key={mood.id} style={{ display: 'block', paddingLeft: '8px' }}>
          <input
            type="checkbox"
            checked={moodIds.has(mood.id)}
            onChange={() => toggle(moodIds, mood.id, setMoodIds, 'mood')}
          />{' '}
          {mood.name}
        </label>
      ))}
    </div>
  )
}
