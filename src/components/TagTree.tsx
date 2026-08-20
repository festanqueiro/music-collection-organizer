import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { matchesTagFilter, type TagFilterState } from '../state/tagFilter'
import type { Track } from '../types'

export function TagTree({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)

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

  function toggle(set: Set<number>, id: number, setter: (s: Set<number>) => void, key: 'genre' | 'subgenre' | 'mood') {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
    const filterState: TagFilterState = {
      genreIds: key === 'genre' ? next : genreIds,
      subgenreIds: key === 'subgenre' ? next : subgenreIds,
      moodIds: key === 'mood' ? next : moodIds,
    }
    applyFilter(filterState)
  }

  return (
    <div>
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Genre</div>
      {genres.map((genre) => (
        <div key={genre.id}>
          <label style={{ display: 'block', paddingLeft: '8px' }}>
            <input
              type="checkbox"
              checked={genreIds.has(genre.id)}
              onChange={() => toggle(genreIds, genre.id, setGenreIds, 'genre')}
            />{' '}
            {genre.name}
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
