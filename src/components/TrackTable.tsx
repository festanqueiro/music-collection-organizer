import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { formatDuration, decodeHtmlEntities } from '../format'
import type { Track, TrackTableColumnKey } from '../types'

type SortKey = TrackTableColumnKey

const contextMenuItemStyle = {
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

const contextMenuIconStyle = { fontSize: '16px' }

export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
  selectedTrackId,
  scrollToTrack,
  onShowInFolderTree,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
  selectedTrackId: number | null
  // A new object each time (even for the same trackId) so clicking the
  // detail panel's title twice in a row re-triggers the scroll — a plain
  // trackId prop wouldn't change identity on a second click.
  scrollToTrack?: { trackId: number; nonce: number } | null
  onShowInFolderTree: (folder: string) => void
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const searchText = useCollectionStore((s) => s.searchText)
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const playTrackNow = useCollectionStore((s) => s.playTrackNow)
  const addToPlaylist = useCollectionStore((s) => s.addToPlaylist)
  const addManyToPlaylist = useCollectionStore((s) => s.addManyToPlaylist)
  const showToast = useCollectionStore((s) => s.showToast)
  const playNext = useCollectionStore((s) => s.playNext)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const columnOrder = useCollectionStore((s) => s.columnOrder)
  const setColumnOrder = useCollectionStore((s) => s.setColumnOrder)
  const sortState = useCollectionStore((s) => s.sortState)
  const setSortState = useCollectionStore((s) => s.setSortState)
  const currentTrackId = playlist[0] ?? null
  const [draggedColumn, setDraggedColumn] = useState<TrackTableColumnKey | null>(null)
  const sortKey = sortState.key
  const sortDir = sortState.direction
  const [contextMenu, setContextMenu] = useState<{ trackId: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    // Deliberately no 'contextmenu' listener here — right-clicking a
    // different row already reopens the menu via that row's own
    // onContextMenu handler (setting new state directly), and a second
    // window-level 'contextmenu' listener closing to null would race it:
    // both fire from the same event's bubble phase, and being registered
    // second, this one would run after and clobber the just-opened menu.
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortState({ key, direction: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortState({ key, direction: 'asc' })
    }
  }

  const subgenresById = useMemo(() => new Map(subgenres.map((sg) => [sg.id, sg])), [subgenres])
  const genresById = useMemo(() => new Map(genres.map((g) => [g.id, g])), [genres])

  function tagNamesFor(trackId: number): { name: string; color: string | null }[] {
    const tags = trackTags.get(trackId)
    if (!tags) return []
    const genreNames = tags.genreIds
      .map((id) => genresById.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => ({ name: g.name, color: g.color }))
    const subgenreNames = tags.subgenreIds
      .map((id) => subgenresById.get(id))
      .filter((sg): sg is NonNullable<typeof sg> => !!sg)
      .map((sg) => ({ name: sg.name, color: genresById.get(sg.genreId)?.color ?? null }))
    return [...genreNames, ...subgenreNames].sort((a, b) => a.name.localeCompare(b.name))
  }

  // 'tags' has no matching field on Track (it's derived from trackTags),
  // so it needs its own comparable value instead of the direct property
  // lookup every other column uses.
  function sortValueFor(track: Track, key: SortKey): string | number {
    if (key === 'tags') return tagNamesFor(track.id).map((t) => t.name).join(', ')
    return track[key] ?? ''
  }

  const visibleTracks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return tracks
      .filter((t) => (selectedFolder ? t.folder === selectedFolder || t.folder.startsWith(selectedFolder + '/') : true))
      .filter(activeFilter)
      .filter((t) =>
        query
          ? [t.title, t.artist, t.album, t.filename].some((v) => v?.toLowerCase().includes(query)) ||
            tagNamesFor(t.id).some((tag) => tag.name.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => {
        const av = sortValueFor(a, sortKey)
        const bv = sortValueFor(b, sortKey)
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [tracks, searchText, selectedFolder, activeFilter, sortKey, sortDir, trackTags, genresById, subgenresById])

  // Re-analysing a track changes its BPM/Key, which can shift its sort
  // position out of the visible scroll area — clicking the track's title
  // in the detail panel scrolls it back into view.
  useEffect(() => {
    if (!scrollToTrack) return
    const row = document.querySelector(`tr[data-track-id="${scrollToTrack.trackId}"]`)
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [scrollToTrack])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
      if (visibleTracks.length === 0) return
      e.preventDefault()
      const currentIndex = selectedTrackId ? visibleTracks.findIndex((t) => t.id === selectedTrackId) : -1
      // PageUp/PageDown jump a fixed number of rows rather than measuring
      // the actual scrollable viewport height — a reasonable approximation
      // for "about a screen" without wiring up row-height/container
      // measurement just for this.
      const PAGE_SIZE = 10
      let nextIndex = currentIndex
      if (e.key === 'ArrowDown') nextIndex = Math.min(visibleTracks.length - 1, currentIndex + 1)
      else if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1)
      else if (e.key === 'Home') nextIndex = 0
      else if (e.key === 'End') nextIndex = visibleTracks.length - 1
      else if (e.key === 'PageDown') nextIndex = Math.min(visibleTracks.length - 1, currentIndex + PAGE_SIZE)
      else if (e.key === 'PageUp') nextIndex = Math.max(0, currentIndex - PAGE_SIZE)
      onSelect(visibleTracks[nextIndex])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleTracks, selectedTrackId, onSelect, modalOpen])

  const columnLabels: Record<TrackTableColumnKey, string> = {
    title: 'Title',
    filename: 'Filename',
    artist: 'Artist',
    tags: 'Tags',
    bpm: 'BPM',
    musicalKey: 'Key',
    format: 'Format',
    duration: 'Duration',
  }
  const orderedColumns = columnOrder.map((key) => ({ key, label: columnLabels[key] }))

  const cellStyle = { padding: '8px', whiteSpace: 'nowrap' as const }
  const titleCellStyle = { ...cellStyle, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' as const }
  const tagsCellStyle = { ...cellStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' as const }

  function renderCell(track: Track, key: TrackTableColumnKey) {
    switch (key) {
      case 'title':
        return (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                // Loading a track into the player is itself a form of
                // selecting it — without this, the play button and
                // clicking the row would leave the detail panel out of
                // sync with what's actually playing.
                onSelect(track)
                playTrackNow(track.id)
              }}
              title="Play track now"
              style={{
                background: 'none',
                border: 'none',
                padding: '0 4px 0 0',
                cursor: 'pointer',
                verticalAlign: 'middle',
                color: track.id === currentTrackId ? 'var(--color-accent)' : 'var(--color-text-dim)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
                play_circle
              </span>
            </button>
            {track.analysisStatus === 'analyzing' && (
              <span
                className="material-symbols-outlined spin"
                style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px', color: 'var(--color-text-dim)' }}
                title="Analyzing…"
              >
                progress_activity
              </span>
            )}
            {(trackTags.get(track.id)?.genreIds.length ?? 0) + (trackTags.get(track.id)?.subgenreIds.length ?? 0) >
              0 && (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px', color: 'var(--color-text-dim)' }}
                title="This track has tags"
              >
                label
              </span>
            )}
            {decodeHtmlEntities(track.title ?? track.filename)}
          </>
        )
      case 'filename':
        return decodeHtmlEntities(track.filename)
      case 'artist':
        return track.artist ? decodeHtmlEntities(track.artist) : '—'
      case 'tags': {
        const names = tagNamesFor(track.id)
        if (names.length === 0) return '—'
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
            {names.map((t, i) => (
              <span
                key={i}
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  background: t.color ?? 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: t.color ? '#fff' : 'var(--color-text)',
                }}
              >
                {t.name}
              </span>
            ))}
          </span>
        )
      }
      case 'bpm':
        return track.bpm?.toFixed(0) ?? '—'
      case 'musicalKey':
        return track.musicalKey ?? '—'
      case 'format':
        return track.format
      case 'duration':
        return track.duration ? formatDuration(track.duration) : '—'
    }
  }

  function cellStyleFor(key: TrackTableColumnKey) {
    if (key === 'title' || key === 'filename') return titleCellStyle
    if (key === 'tags') return tagsCellStyle
    return cellStyle
  }

  function handleColumnDrop(targetKey: TrackTableColumnKey) {
    if (!draggedColumn || draggedColumn === targetKey) {
      setDraggedColumn(null)
      return
    }
    const next = [...columnOrder]
    const fromIndex = next.indexOf(draggedColumn)
    const toIndex = next.indexOf(targetKey)
    next.splice(fromIndex, 1)
    next.splice(toIndex, 0, draggedColumn)
    setColumnOrder(next)
    setDraggedColumn(null)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ padding: '4px 8px' }}>
        <button
          onClick={() => {
            // Queuing dozens+ of tracks in one click is easy to trigger
            // by accident (e.g. clicking with no folder/tag filter active
            // queues the entire collection) and there's no bulk "clear
            // queue" undo for a mis-click this size — a confirmation only
            // kicks in above a threshold so the common, deliberate case
            // (a filtered folder/tag view) stays a single click.
            if (
              visibleTracks.length > 50 &&
              !window.confirm(`Add all ${visibleTracks.length} tracks to the queue?`)
            ) {
              return
            }
            addManyToPlaylist(visibleTracks.map((t) => t.id))
            showToast(`${visibleTracks.length} track${visibleTracks.length === 1 ? '' : 's'} queued`)
          }}
          disabled={visibleTracks.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            playlist_add
          </span>
          Add all to queue
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={cellStyle}>
              <input
                type="checkbox"
                checked={visibleTracks.length > 0 && visibleTracks.every((t) => checkedTrackIds.has(t.id))}
                onChange={(e) => setTracksChecked(visibleTracks.map((t) => t.id), e.target.checked)}
              />
            </th>
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                draggable
                onDragStart={() => setDraggedColumn(col.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleColumnDrop(col.key)
                }}
                title="Click to sort, drag to reorder"
                style={{
                  ...cellStyle,
                  cursor: 'pointer',
                  textAlign: 'left',
                  opacity: draggedColumn === col.key ? 0.5 : 1,
                }}
              >
                {col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Cloud</th>
          </tr>
        </thead>
        <tbody>
          {tracks.length > 0 && visibleTracks.length === 0 && (
            <tr>
              <td
                colSpan={orderedColumns.length + 3}
                style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)' }}
              >
                No tracks match your search/filter.
              </td>
            </tr>
          )}
          {visibleTracks.map((track) => (
            <tr
              key={track.id}
              data-track-id={track.id}
              className={`track-row${track.id === selectedTrackId ? ' selected' : ''}`}
              onClick={() => onSelect(track)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ trackId: track.id, x: e.clientX, y: e.clientY })
              }}
              draggable
              onDragStart={(e) => {
                // Native OS drag (to Finder, a DAW, etc.) hands off the
                // track's existing file path — it's a reference, not a
                // copy; preventDefault stops the browser's own HTML5 drag
                // image/ghost from also kicking in alongside it.
                e.preventDefault()
                window.api.startTrackDrag(track.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checkedTrackIds.has(track.id)}
                  onChange={() => toggleTrackChecked(track.id)}
                />
              </td>
              {orderedColumns.map((col) => (
                <td key={col.key} style={cellStyleFor(col.key)}>
                  {renderCell(track, col.key)}
                </td>
              ))}
              <td style={cellStyle}>
                {track.analysisStatus === 'analyzing' ? (
                  <span className="material-symbols-outlined spin" style={{ fontSize: '16px' }} title="Analyzing…">
                    progress_activity
                  </span>
                ) : track.analysisStatus === 'error' ? (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px', color: '#f87171' }}
                    title="Analysis failed"
                  >
                    error
                  </span>
                ) : null}
              </td>
              <td style={cellStyle}>
                {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
              playTrackNow(contextMenu.trackId)
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              play_arrow
            </span>
            Play track now
          </button>
          <button
            onClick={() => {
              addToPlaylist(contextMenu.trackId)
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              playlist_add
            </span>
            Add to queue
          </button>
          <button
            onClick={() => {
              playNext(contextMenu.trackId)
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              skip_next
            </span>
            Play next
          </button>
          <button
            onClick={() => {
              runAnalysis([contextMenu.trackId])
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              graphic_eq
            </span>
            {tracks.find((t) => t.id === contextMenu.trackId)?.analysisStatus === 'done'
              ? 'Re-analyse track'
              : 'Analyse track'}
          </button>
          <button
            onClick={() => {
              window.api.showTrackInFolder(contextMenu.trackId)
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              folder_open
            </span>
            Show in File Explorer
          </button>
          <button
            onClick={() => {
              const track = tracks.find((t) => t.id === contextMenu.trackId)
              if (track) onShowInFolderTree(track.folder)
              setContextMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              account_tree
            </span>
            Show in Folder Tree View
          </button>
        </div>
      )}
    </div>
  )
}
