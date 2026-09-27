import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'
import { SubtagRing, TREE_CHECKBOX_STYLE, TREE_INDENT_PX, TREE_ROW_PX } from './TagTree'

// Groups by actual track co-tagging, not the schema's own subgenre->genre
// parent link — a subtag like "5 Stars" is typically its own genre's
// child (e.g. under a "Ratings" genre), but what's useful to browse here
// is which *other* genres (Dub, Dubstep, …) tracks carrying that subtag
// also happen to be tagged with. That's derived per-subgenre from
// trackTags, not read off the subgenres table.
export function SubtagTree({
  onFilterChange,
  clearSignal,
}: {
  // label: the selected subtag (and tag), or null when nothing is.
  onFilterChange: (filter: (track: Track) => boolean, label: string | null) => void
  // Changes when the table's chip is cleared: deselect.
  clearSignal: number
}) {
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
      onFilterChange(() => true, null)
      return
    }
    const subtagName = subgenres.find((sg) => sg.id === next.subgenreId)?.name ?? 'Subtag'
    const label = next.genreId != null ? `${subtagName} in ${genreNameById.get(next.genreId) ?? 'a tag'}` : subtagName
    onFilterChange((track: Track) => {
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [] }
      if (!tags.subgenreIds.includes(next.subgenreId)) return false
      if (next.genreId != null && !tags.genreIds.includes(next.genreId)) return false
      return true
    }, label)
  }

  useEffect(() => {
    if (clearSignal !== 0) applyFilter(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal])

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
        <div style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>No subtags yet.</div>
      )}
      {subgenres.map((sg) => {
        const genreIds = [...(genreIdsBySubgenreId.get(sg.id) ?? [])].sort((a, b) =>
          (genreNameById.get(a) ?? '').localeCompare(genreNameById.get(b) ?? '')
        )
        const isExpanded = expandedSubgenreId === sg.id
        const isSelected = selection?.subgenreId === sg.id && selection.genreId == null
        return (
          <div key={sg.id}>
            {/* Rows laid out like the Tags and Folders views' (same margin,
                spacing and height). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', minHeight: `${TREE_ROW_PX}px` }}>
              {genreIds.length > 0 ? (
                <span
                  className="material-symbols-outlined"
                  onClick={() => toggleExpand(sg.id)}
                  title="Show the tags used with this subtag"
                  style={{ fontSize: '14px', width: '14px', flexShrink: 0, cursor: 'pointer' }}
                >
                  {isExpanded ? 'expand_more' : 'chevron_right'}
                </span>
              ) : (
                <span style={{ display: 'inline-block', width: '14px', flexShrink: 0 }} />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <input type="checkbox" style={TREE_CHECKBOX_STYLE} checked={isSelected} onChange={() => toggleSubgenreFilter(sg.id)} />
                {sg.color && <SubtagRing color={sg.color} inRow />}
                <span>{sg.name}</span>
                {genreNameById.get(sg.genreId) && (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: '12px', marginLeft: '4px' }}>
                    ({genreNameById.get(sg.genreId)})
                  </span>
                )}
              </label>
            </div>
            {isExpanded &&
              genreIds.map((genreId) => (
                <label
                  key={genreId}
                  style={{ display: 'flex', alignItems: 'center', gap: '2px', minHeight: `${TREE_ROW_PX}px`, paddingLeft: `${TREE_INDENT_PX}px` }}
                >
                  <span style={{ display: 'inline-block', width: '14px', flexShrink: 0 }} />
                  <input
                    type="checkbox"
                    style={TREE_CHECKBOX_STYLE}
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
