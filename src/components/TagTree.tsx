import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { countTracksByTag, matchesTagFilter, type TagFilterMode, type TagFilterState } from '../state/tagFilter'
import type { Track } from '../types'
import { useTagContextMenu } from './useTagContextMenu'
import { writeStored } from '../state/stored'

// Drops any id from `ids` that no longer exists in `existing` — e.g. after
// deleteGenre removes a genre out from under a still-checked checkbox, so
// the filter doesn't keep matching against an id nothing has anymore
// (which would otherwise make the track list go silently empty).
function intersectWithExisting(ids: Set<number>, existing: { id: number }[]): Set<number> {
  const existingIds = new Set(existing.map((x) => x.id))
  return new Set([...ids].filter((id) => existingIds.has(id)))
}

// A sub-genre's colour, as an outline — like its badges in the table.
// `inRow`: in a flex row that spaces its items itself (no own margin).
export function SubtagRing({ color, inRow = false }: { color: string; inRow?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        border: `2px solid ${color}`,
        marginRight: inRow ? '2px' : '4px',
        flexShrink: 0,
        verticalAlign: 'middle',
        boxSizing: 'border-box',
      }}
    />
  )
}

// How many tracks a tag's row would list, at the end of the row — written
// like a playlist's song count in the Playlists box.
export function TagTrackCount({ count }: { count: number }) {
  return (
    <span
      title={`${count} track${count === 1 ? '' : 's'}`}
      style={{ color: 'var(--color-text-dim)', fontSize: '11px', fontVariantNumeric: 'tabular-nums', margin: '0 4px 0 2px', flexShrink: 0 }}
    >
      {count}
    </span>
  )
}

// One nesting level, as in the folder tree.
export const TREE_INDENT_PX = 16
// A folder row's height, so both lists have the same rhythm.
export const TREE_ROW_PX = 20
// No margin before the box (lining it up with a folder's icon); a little
// after it, before the colour mark.
export const TREE_CHECKBOX_STYLE = { margin: '0 4px 0 0', flexShrink: 0 }

// Which tags have their subtags open, remembered across launches like the
// folder tree's. Starts all collapsed.
const EXPANDED_TAGS_KEY = 'tagTreeExpanded'
function loadExpandedTags(): Set<number> {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_TAGS_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [])
  } catch {
    return new Set()
  }
}
function saveExpandedTags(expanded: Set<number>): void {
  writeStored(EXPANDED_TAGS_KEY, JSON.stringify([...expanded]))
}

// A short description of the ticked tags, for the chip above the table.
function describeTagSelection(names: string[], mode: TagFilterMode): string | null {
  if (names.length === 0) return null
  const shown = names.slice(0, 3).join(mode === 'AND' ? ' + ' : ' or ')
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown
}

export function TagTree({
  onFilterChange,
  clearSignal,
}: {
  // label: what's ticked, or null when nothing is.
  onFilterChange: (filter: (track: Track) => boolean, label: string | null) => void
  // Changes when the table's chip is cleared: untick everything.
  clearSignal: number
}) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const tracks = useCollectionStore((s) => s.tracks)

  const [genreIds, setGenreIds] = useState<Set<number>>(new Set())
  const [subgenreIds, setSubgenreIds] = useState<Set<number>>(new Set())
  const [filterMode, setFilterMode] = useState<TagFilterMode>('OR')
  const { openContextMenu, isRenaming, renameField, menus } = useTagContextMenu()
  const [expanded, setExpanded] = useState(loadExpandedTags)
  function updateExpanded(next: Set<number>) {
    setExpanded(next)
    saveExpandedTags(next)
  }
  function toggleExpanded(genreId: number) {
    const next = new Set(expanded)
    if (next.has(genreId)) next.delete(genreId)
    else next.add(genreId)
    updateExpanded(next)
  }

  const subgenreIdsByGenreId = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const sg of subgenres) {
      if (!map.has(sg.genreId)) map.set(sg.genreId, [])
      map.get(sg.genreId)!.push(sg.id)
    }
    return map
  }, [subgenres])

  const trackCounts = useMemo(
    () => countTracksByTag(tracks.map((t) => t.id), trackTags, subgenres),
    [tracks, trackTags, subgenres]
  )

  function applyFilter(next: TagFilterState, mode: TagFilterMode) {
    const names = [
      ...genres.filter((g) => next.genreIds.has(g.id)).map((g) => g.name),
      ...subgenres.filter((sg) => next.subgenreIds.has(sg.id)).map((sg) => sg.name),
    ]
    onFilterChange((track: Track) => {
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [] }
      return matchesTagFilter(tags, next, subgenreIdsByGenreId, mode)
    }, describeTagSelection(names, mode))
  }

  useEffect(() => {
    if (clearSignal === 0) return
    setGenreIds(new Set())
    setSubgenreIds(new Set())
    applyFilter({ genreIds: new Set(), subgenreIds: new Set() }, filterMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal])

  // A checkbox toggle rebuilds the filter closure over trackTags as it was
  // at that moment — if a tag edit elsewhere changes trackTags afterward
  // without the user touching a checkbox, the stored filter closure goes
  // stale (it still matches against the old trackTags). Re-applying the
  // current filter selection whenever trackTags (or the genre/subgenre
  // lists themselves, e.g. after a delete) changes keeps it live.
  useEffect(() => {
    applyFilter(
      {
        genreIds: intersectWithExisting(genreIds, genres),
        subgenreIds: intersectWithExisting(subgenreIds, subgenres),
      },
      filterMode
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackTags, genres, subgenres, filterMode])

  function toggle(set: Set<number>, id: number, setter: (s: Set<number>) => void, key: 'genre' | 'subgenre') {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
    const filterState: TagFilterState = {
      genreIds: intersectWithExisting(key === 'genre' ? next : genreIds, genres),
      subgenreIds: intersectWithExisting(key === 'subgenre' ? next : subgenreIds, subgenres),
    }
    applyFilter(filterState, filterMode)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
        <span style={{ fontWeight: 600, flex: 1 }}>Tag</span>
        {expanded.size > 0 && (
          <button
            onClick={() => updateExpanded(new Set())}
            title="Collapse all tags"
            aria-label="Collapse all tags"
            style={{ background: 'none', border: 'none', padding: '2px', display: 'flex', color: 'var(--color-text-dim)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              unfold_less
            </span>
          </button>
        )}
        {genreIds.size + subgenreIds.size > 1 && (
          <div
            title={filterMode === 'AND' ? 'Match tracks with all selected tags' : 'Match tracks with any selected tag'}
            style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}
          >
            {(['OR', 'AND'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setFilterMode(mode)
                  applyFilter(
                    { genreIds: intersectWithExisting(genreIds, genres), subgenreIds: intersectWithExisting(subgenreIds, subgenres) },
                    mode
                  )
                }}
                style={{
                  border: 'none',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  background: filterMode === mode ? 'var(--color-accent)' : 'none',
                  color: filterMode === mode ? 'var(--color-on-accent)' : 'var(--color-text-dim)',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
      </div>
      {genres.map((genre) => {
        const children = subgenres.filter((sg) => sg.genreId === genre.id)
        const open = expanded.has(genre.id)
        // Shown on a collapsed tag, so ticked subtags don't vanish from view.
        const tickedInside = open ? 0 : children.filter((sg) => subgenreIds.has(sg.id)).length
        return (
        <div key={genre.id}>
          <label
            onContextMenu={(e) => openContextMenu(e, { kind: 'genre', id: genre.id, name: genre.name })}
            // The folder tree's spacing: the checkbox sits where a folder's icon does.
            style={{ display: 'flex', alignItems: 'center', gap: '2px', minHeight: `${TREE_ROW_PX}px` }}
          >
            {children.length > 0 ? (
              <span
                className="material-symbols-outlined"
                title={open ? 'Hide subtags' : 'Show subtags'}
                style={{ fontSize: '14px', cursor: 'pointer', flexShrink: 0, width: '14px' }}
                onClick={(e) => {
                  // Not the label's checkbox.
                  e.preventDefault()
                  e.stopPropagation()
                  toggleExpanded(genre.id)
                }}
              >
                {open ? 'expand_more' : 'chevron_right'}
              </span>
            ) : (
              <span style={{ display: 'inline-block', width: '14px', flexShrink: 0 }} />
            )}
            <input
              type="checkbox"
              style={TREE_CHECKBOX_STYLE}
              checked={genreIds.has(genre.id)}
              onChange={() => toggle(genreIds, genre.id, setGenreIds, 'genre')}
            />{' '}
            {genre.color && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: genre.color,
                  flexShrink: 0,
                  marginRight: '2px',
                }}
              />
            )}
            {isRenaming('genre', genre.id) ? renameField(genre.name) : <span style={{ flex: 1 }}>{genre.name}</span>}
            {tickedInside > 0 && (
              <span
                title={`${tickedInside} subtag${tickedInside === 1 ? '' : 's'} ticked`}
                style={{ fontSize: '10px', padding: '0 5px', borderRadius: '8px', background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                {tickedInside}
              </span>
            )}
            <TagTrackCount count={trackCounts.genres.get(genre.id) ?? 0} />
          </label>
          {open &&
            children.map((sg) => (
              <label
                key={sg.id}
                onContextMenu={(e) => openContextMenu(e, { kind: 'subgenre', id: sg.id, name: sg.name })}
                // Laid out like a tag's row, one level in (as a subfolder is
                // in the folder tree), with the chevron's space kept.
                style={{ display: 'flex', alignItems: 'center', gap: '2px', minHeight: `${TREE_ROW_PX}px`, paddingLeft: `${TREE_INDENT_PX}px` }}
              >
                <span style={{ display: 'inline-block', width: '14px', flexShrink: 0 }} />
                <input
                  type="checkbox"
                  style={TREE_CHECKBOX_STYLE}
                  checked={subgenreIds.has(sg.id)}
                  onChange={() => toggle(subgenreIds, sg.id, setSubgenreIds, 'subgenre')}
                />{' '}
                {sg.color && <SubtagRing color={sg.color} inRow />}
                {isRenaming('subgenre', sg.id) ? renameField(sg.name) : <span style={{ flex: 1 }}>{sg.name}</span>}
                <TagTrackCount count={trackCounts.subgenres.get(sg.id) ?? 0} />
              </label>
            ))}
        </div>
        )
      })}

      {menus}
    </div>
  )
}
