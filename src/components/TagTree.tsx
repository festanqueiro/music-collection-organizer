import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTEXT_MENU_Z_INDEX } from './contextMenuStyles'
import { useCollectionStore } from '../state/store'
import { matchesTagFilter, type TagFilterMode, type TagFilterState } from '../state/tagFilter'
import type { Track } from '../types'
import { TagColorPopover } from './TagColorPopover'

// Drops any id from `ids` that no longer exists in `existing` — e.g. after
// deleteGenre removes a genre out from under a still-checked checkbox, so
// the filter doesn't keep matching against an id nothing has anymore
// (which would otherwise make the track list go silently empty).
function intersectWithExisting(ids: Set<number>, existing: { id: number }[]): Set<number> {
  const existingIds = new Set(existing.map((x) => x.id))
  return new Set([...ids].filter((id) => existingIds.has(id)))
}

// A sub-genre's colour, as an outline — like its badges in the table.
export function SubtagRing({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        border: `2px solid ${color}`,
        marginRight: '4px',
        verticalAlign: 'middle',
        boxSizing: 'border-box',
      }}
    />
  )
}

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
  try {
    localStorage.setItem(EXPANDED_TAGS_KEY, JSON.stringify([...expanded]))
  } catch {
    // Non-essential preference — fine to lose.
  }
}

type ContextMenuTarget = { kind: 'genre'; id: number; name: string } | { kind: 'subgenre'; id: number; name: string }

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
  const deleteGenre = useCollectionStore((s) => s.deleteGenre)
  const deleteSubgenre = useCollectionStore((s) => s.deleteSubgenre)
  const renameGenre = useCollectionStore((s) => s.renameGenre)
  const renameSubgenre = useCollectionStore((s) => s.renameSubgenre)
  const setGenreColor = useCollectionStore((s) => s.setGenreColor)
  const setSubgenreColor = useCollectionStore((s) => s.setSubgenreColor)

  const [genreIds, setGenreIds] = useState<Set<number>>(new Set())
  const [subgenreIds, setSubgenreIds] = useState<Set<number>>(new Set())
  const [filterMode, setFilterMode] = useState<TagFilterMode>('OR')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null)
  // "Choose color…" opens this where the menu was.
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null)
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

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

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

  async function handleRename(target: ContextMenuTarget) {
    const newName = window.prompt(`Rename "${target.name}" to:`, target.name)
    if (!newName || !newName.trim() || newName.trim() === target.name) return

    const count =
      target.kind === 'genre'
        ? await window.api.countTracksWithGenre(target.id)
        : await window.api.countTracksWithSubgenre(target.id)

    if (count > 0) {
      const proceed = window.confirm(`${count} file${count === 1 ? ' is' : 's are'} affected by this change, are you sure?`)
      if (!proceed) return
    }

    if (target.kind === 'genre') await renameGenre(target.id, newName.trim())
    else await renameSubgenre(target.id, newName.trim())
  }

  async function handleDelete(target: ContextMenuTarget) {
    const count =
      target.kind === 'genre'
        ? await window.api.countTracksWithGenre(target.id)
        : await window.api.countTracksWithSubgenre(target.id)

    const label = target.kind === 'genre' ? 'tag' : 'subtag'
    const proceed = window.confirm(
      count > 0
        ? `Are you sure you want to delete this ${label}? ${count} file${count === 1 ? ' is' : 's are'} tagged with it.`
        : `Are you sure you want to delete this ${label}?`
    )
    if (!proceed) return

    if (target.kind === 'genre') await deleteGenre(target.id)
    else await deleteSubgenre(target.id)
  }

  function openContextMenu(e: React.MouseEvent, target: ContextMenuTarget) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, target })
  }

  const menuItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    textAlign: 'left' as const,
    background: 'none',
    border: 'none',
    padding: '4px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
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
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
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
                }}
              />
            )}
            <span style={{ flex: 1 }}>{genre.name}</span>
            {tickedInside > 0 && (
              <span
                title={`${tickedInside} subtag${tickedInside === 1 ? '' : 's'} ticked`}
                style={{ fontSize: '10px', padding: '0 5px', borderRadius: '8px', background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
              >
                {tickedInside}
              </span>
            )}
          </label>
          {open &&
            children.map((sg) => (
              <label
                key={sg.id}
                onContextMenu={(e) => openContextMenu(e, { kind: 'subgenre', id: sg.id, name: sg.name })}
                style={{ display: 'block', paddingLeft: '34px' }}
              >
                <input
                  type="checkbox"
                  checked={subgenreIds.has(sg.id)}
                  onChange={() => toggle(subgenreIds, sg.id, setSubgenreIds, 'subgenre')}
                />{' '}
                {sg.color && <SubtagRing color={sg.color} />}
                {sg.name}
              </label>
            ))}
        </div>
        )
      })}

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '4px',
            zIndex: CONTEXT_MENU_Z_INDEX,
          }}
        >
          <button
            onClick={() => {
              handleRename(contextMenu.target)
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              edit
            </span>
            Rename
          </button>
          <button
            onClick={() => {
              setColorPicker({ x: contextMenu.x, y: contextMenu.y, target: contextMenu.target })
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              palette
            </span>
            Choose color…
          </button>
          <button
            onClick={() => {
              handleDelete(contextMenu.target)
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              delete
            </span>
            Delete
          </button>
        </div>
      )}

      {colorPicker && (
        <TagColorPopover
          x={colorPicker.x}
          y={colorPicker.y}
          current={
            (colorPicker.target.kind === 'genre' ? genres : subgenres).find((t) => t.id === colorPicker.target.id)?.color ?? null
          }
          onPick={(color) => {
            if (colorPicker.target.kind === 'genre') setGenreColor(colorPicker.target.id, color)
            else setSubgenreColor(colorPicker.target.id, color)
            setColorPicker(null)
          }}
          onClose={() => setColorPicker(null)}
        />
      )}
    </div>
  )
}
