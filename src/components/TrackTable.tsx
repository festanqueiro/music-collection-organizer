import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'

type SortKey = 'title' | 'artist' | 'bpm' | 'musicalKey' | 'format' | 'duration'

function formatDuration(totalSeconds: number): string {
  const total = Math.round(totalSeconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
  selectedTrackId,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
  selectedTrackId: number | null
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const searchText = useCollectionStore((s) => s.searchText)
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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
    { key: 'artist', label: 'Artist' },
    { key: 'bpm', label: 'BPM' },
    { key: 'musicalKey', label: 'Key' },
    { key: 'format', label: 'Format' },
    { key: 'duration', label: 'Duration' },
  ]

  const cellStyle = { padding: '8px', whiteSpace: 'nowrap' as const }

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
            <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
              <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checkedTrackIds.has(track.id)}
                  onChange={() => toggleTrackChecked(track.id)}
                />
              </td>
              <td style={cellStyle}>{track.title ?? track.filename}</td>
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
    </div>
  )
}
