import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'

// Groups by actual track co-tagging, not the schema's own subgenre->genre
// parent link — a subtag like "5 Stars" is typically its own genre's
// child (e.g. under a "Ratings" genre), but what's useful to browse here
// is which *other* genres (Dub, Dubstep, …) tracks carrying that subtag
// also happen to be tagged with. That's derived per-subgenre from
// trackTags, not read off the subgenres table.
export function SubtagTree({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const subgenres = useCollectionStore((s) => s.subgenres)
  const genres = useCollectionStore((s) => s.genres)
  const trackTags = useCollectionStore((s) => s.trackTags)

  const [expandedSubgenreId, setExpandedSubgenreId] = useState<number | null>(null)
  const [selection, setSelection] = useState<{ subgenreId: number; genreId: number | null } | null>(null)

  const genreNameById = useMemo(() => new Map(genres.map((g) => [g.id, g.name])), [genres])

  // For every subgenre id, the distinct set of genre ids any track tagged
  // with it also carries — computed once per trackTags change rather than
  // re-scanning the whole map on every row expand/collapse.
  const genreIdsBySubgenreId = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const tags of trackTags.values()) {
      for (const subgenreId of tags.subgenreIds) {
        if (!map.has(subgenreId)) map.set(subgenreId, new Set())
        const set = map.get(subgenreId)!
        for (const genreId of tags.genreIds) set.add(genreId)
      }
    }
    return map
  }, [trackTags])

  function applyFilter(next: { subgenreId: number; genreId: number | null } | null) {
    setSelection(next)
    if (!next) {
      onFilterChange(() => true)
      return
    }
    onFilterChange((track: Track) => {
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [] }
      if (!tags.subgenreIds.includes(next.subgenreId)) return false
      if (next.genreId != null && !tags.genreIds.includes(next.genreId)) return false
      return true
    })
  }

  function toggleExpand(subgenreId: number) {
    setExpandedSubgenreId((prev) => (prev === subgenreId ? null : subgenreId))
  }

  function toggleSubgenreFilter(subgenreId: number) {
    if (selection?.subgenreId === subgenreId && selection.genreId == null) applyFilter(null)
    else applyFilter({ subgenreId, genreId: null })
  }

  function toggleGenreFilter(subgenreId: number, genreId: number) {
    if (selection?.subgenreId === subgenreId && selection.genreId === genreId) applyFilter({ subgenreId, genreId: null })
    else applyFilter({ subgenreId, genreId })
  }

  return (
    <div>
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Subtag</div>
      {subgenres.length === 0 && (
        <div style={{ color: 'var(--color-text-dim)', fontSize: '12px', paddingLeft: '8px' }}>No subtags yet.</div>
      )}
      {subgenres.map((sg) => {
        const genreIds = [...(genreIdsBySubgenreId.get(sg.id) ?? [])].sort((a, b) =>
          (genreNameById.get(a) ?? '').localeCompare(genreNameById.get(b) ?? '')
        )
        const isExpanded = expandedSubgenreId === sg.id
        const isSelected = selection?.subgenreId === sg.id && selection.genreId == null
        return (
          <div key={sg.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
              <button
                onClick={() => toggleExpand(sg.id)}
                disabled={genreIds.length === 0}
                style={{ background: 'none', border: 'none', padding: 0, cursor: genreIds.length ? 'pointer' : 'default' }}
                title={genreIds.length ? 'Show genres tagged with this subtag' : 'No genres tagged with this subtag yet'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', opacity: genreIds.length ? 1 : 0.3 }}>
                  {isExpanded ? 'expand_more' : 'chevron_right'}
                </span>
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, cursor: 'pointer' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSubgenreFilter(sg.id)} />
                {sg.name}
                {genreNameById.get(sg.genreId) && (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
                    ({genreNameById.get(sg.genreId)})
                  </span>
                )}
              </label>
            </div>
            {isExpanded &&
              genreIds.map((genreId) => (
                <label
                  key={genreId}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '32px' }}
                >
                  <input
                    type="checkbox"
                    checked={selection?.subgenreId === sg.id && selection.genreId === genreId}
                    onChange={() => toggleGenreFilter(sg.id, genreId)}
                  />
                  {genreNameById.get(genreId) ?? `Tag ${genreId}`}
                </label>
              ))}
          </div>
        )
      })}
    </div>
  )
}
