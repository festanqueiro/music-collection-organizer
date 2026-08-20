import { useMemo, useState } from 'react'
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
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const searchText = useCollectionStore((s) => s.searchText)
  const [sortKey, setSortKey] = useState<SortKey>('title')

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
        return av < bv ? -1 : av > bv ? 1 : 0
      })
  }, [tracks, searchText, selectedFolder, activeFilter, sortKey])

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
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => setSortKey(col.key)}
                style={{ ...cellStyle, cursor: 'pointer', textAlign: 'left' }}
              >
                {col.label}
              </th>
            ))}
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Cloud</th>
          </tr>
        </thead>
        <tbody>
          {visibleTracks.map((track) => (
            <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
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
