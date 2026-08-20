import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'

type SortKey = 'title' | 'artist' | 'bpm' | 'musicalKey' | 'format' | 'duration'

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

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} onClick={() => setSortKey(col.key)} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}>
              {col.label}
            </th>
          ))}
          <th>Cloud</th>
        </tr>
      </thead>
      <tbody>
        {visibleTracks.map((track) => (
          <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
            <td style={{ padding: '8px' }}>{track.title ?? track.filename}</td>
            <td>{track.artist ?? '—'}</td>
            <td>{track.bpm?.toFixed(0) ?? '—'}</td>
            <td>{track.musicalKey ?? '—'}</td>
            <td>{track.format}</td>
            <td>{track.duration ? `${Math.round(track.duration)}s` : '—'}</td>
            <td>
              {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
