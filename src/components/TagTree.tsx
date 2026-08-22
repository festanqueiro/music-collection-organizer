import { useEffect, useMemo, useRef, useState } from 'react'
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

type ContextMenuTarget = { kind: 'genre'; id: number; name: string } | { kind: 'subgenre'; id: number; name: string }

export function TagTree({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const deleteGenre = useCollectionStore((s) => s.deleteGenre)
  const deleteSubgenre = useCollectionStore((s) => s.deleteSubgenre)
  const renameGenre = useCollectionStore((s) => s.renameGenre)
  const renameSubgenre = useCollectionStore((s) => s.renameSubgenre)
  const setGenreColor = useCollectionStore((s) => s.setGenreColor)

  const [genreIds, setGenreIds] = useState<Set<number>>(new Set())
  const [subgenreIds, setSubgenreIds] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  // Set when "Choose color…" is clicked, not read off contextMenu at
  // change-time — the menu is already closed (and contextMenu nulled) by
  // the time the native color picker's onChange actually fires.
  const colorTargetGenreId = useRef<number | null>(null)

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
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [] }
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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackTags, genres, subgenres])

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
    applyFilter(filterState)
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
      <input
        ref={colorInputRef}
        type="color"
        style={{ position: 'fixed', top: -9999, left: -9999, width: 0, height: 0, opacity: 0 }}
        onChange={(e) => {
          if (colorTargetGenreId.current != null) setGenreColor(colorTargetGenreId.current, e.target.value)
        }}
      />
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Tag</div>
      {genres.map((genre) => (
        <div key={genre.id}>
          <label
            onContextMenu={(e) => openContextMenu(e, { kind: 'genre', id: genre.id, name: genre.name })}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}
          >
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
          </label>
          {subgenres
            .filter((sg) => sg.genreId === genre.id)
            .map((sg) => (
              <label
                key={sg.id}
                onContextMenu={(e) => openContextMenu(e, { kind: 'subgenre', id: sg.id, name: sg.name })}
                style={{ display: 'block', paddingLeft: '24px' }}
              >
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
            zIndex: 20,
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
          {contextMenu.target.kind === 'genre' && (
            <button
              onClick={() => {
                colorTargetGenreId.current = contextMenu.target.id
                colorInputRef.current?.click()
                setContextMenu(null)
              }}
              style={menuItemStyle}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                palette
              </span>
              Choose color…
            </button>
          )}
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
    </div>
  )
}
