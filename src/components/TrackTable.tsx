import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { formatDuration } from '../format'
import type { Track } from '../types'

type SortKey = 'title' | 'filename' | 'artist' | 'bpm' | 'musicalKey' | 'format' | 'duration'

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
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
  selectedTrackId: number | null
  // A new object each time (even for the same trackId) so clicking the
  // detail panel's title twice in a row re-triggers the scroll — a plain
  // trackId prop wouldn't change identity on a second click.
  scrollToTrack?: { trackId: number; nonce: number } | null
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const searchText = useCollectionStore((s) => s.searchText)
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const playTrackNow = useCollectionStore((s) => s.playTrackNow)
  const addToPlaylist = useCollectionStore((s) => s.addToPlaylist)
  const playNext = useCollectionStore((s) => s.playNext)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const currentTrackId = playlist[0] ?? null
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const visibleTracks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return tracks
      .filter((t) => (selectedFolder ? t.folder === selectedFolder || t.folder.startsWith(selectedFolder + '/') : true))
      .filter(activeFilter)
      .filter((t) =>
        query
          ? [t.title, t.artist, t.album, t.filename].some((v) => v?.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [tracks, searchText, selectedFolder, activeFilter, sortKey, sortDir])

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
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (visibleTracks.length === 0) return
      e.preventDefault()
      const currentIndex = selectedTrackId ? visibleTracks.findIndex((t) => t.id === selectedTrackId) : -1
      const nextIndex =
        e.key === 'ArrowDown'
          ? Math.min(visibleTracks.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1)
      onSelect(visibleTracks[nextIndex])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleTracks, selectedTrackId, onSelect, modalOpen])

  const columns: { key: SortKey; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'filename', label: 'Filename' },
    { key: 'artist', label: 'Artist' },
    { key: 'bpm', label: 'BPM' },
    { key: 'musicalKey', label: 'Key' },
    { key: 'format', label: 'Format' },
    { key: 'duration', label: 'Duration' },
  ]

  const cellStyle = { padding: '8px', whiteSpace: 'nowrap' as const }
  const titleCellStyle = { ...cellStyle, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' as const }

  return (
    <div style={{ overflowX: 'auto' }}>
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
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{ ...cellStyle, cursor: 'pointer', textAlign: 'left' }}
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
              <td style={titleCellStyle}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
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
                {track.title ?? track.filename}
              </td>
              <td style={titleCellStyle}>{track.filename}</td>
              <td style={cellStyle}>{track.artist ?? '—'}</td>
              <td style={cellStyle}>{track.bpm?.toFixed(0) ?? '—'}</td>
              <td style={cellStyle}>{track.musicalKey ?? '—'}</td>
              <td style={cellStyle}>{track.format}</td>
              <td style={cellStyle}>{track.duration ? formatDuration(track.duration) : '—'}</td>
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
        </div>
      )}
    </div>
  )
}
