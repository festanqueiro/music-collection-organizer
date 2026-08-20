// src/components/DetailPanel.tsx
import { useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'
import { Player } from './Player'

function NewTagInput({
  placeholder,
  disabled,
  onCreate,
}: {
  placeholder: string
  disabled?: boolean
  onCreate: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!value.trim()) return
    try {
      setError(null)
      await onCreate(value)
      setValue('')
    } catch {
      setError('Could not create — name may already exist.')
    }
  }

  return (
    <div style={{ marginTop: '4px' }}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          padding: '4px 6px',
          color: 'var(--color-text)',
          fontSize: '12px',
          marginRight: '4px',
        }}
      />
      <button onClick={submit} disabled={disabled || !value.trim()}>
        + Add
      </button>
      {error && <div style={{ color: 'var(--color-secondary)', fontSize: '11px' }}>{error}</div>}
    </div>
  )
}

export function DetailPanel({ track: selectedTrack }: { track: Track | null }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const loadAll = useCollectionStore((s) => s.loadAll)
  const setTrackGenres = useCollectionStore((s) => s.setTrackGenres)
  const setTrackSubgenres = useCollectionStore((s) => s.setTrackSubgenres)
  const setTrackMoods = useCollectionStore((s) => s.setTrackMoods)
  const createGenre = useCollectionStore((s) => s.createGenre)
  const createSubgenre = useCollectionStore((s) => s.createSubgenre)
  const createMood = useCollectionStore((s) => s.createMood)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  if (!selectedTrack) return <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>Select a track</div>

  // Re-derive from the live store on every render so this panel reflects
  // updates (e.g. after a download+analyze, or a tag edit) without needing
  // the caller to re-select the row. Falls back to the prop in case the
  // track briefly isn't in `tracks` yet (e.g. mid-reload).
  const track = tracks.find((t) => t.id === selectedTrack.id) ?? selectedTrack

  const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [], moodIds: [] }
  const availableSubgenres = subgenres.filter((sg) => tags.genreIds.includes(sg.genreId))

  function toggleInList(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await window.api.downloadTrack(track.id, track.path)
      await loadAll()
    } catch {
      setDownloadError('Download failed — check the file is still reachable and try again.')
    } finally {
      setDownloading(false)
    }
  }

  if (track.cloudStatus === 'cloud_only') {
    return (
      <div style={{ padding: '16px' }}>
        <h3>{track.filename}</h3>
        <p>
          <span className="material-symbols-outlined">cloud</span> This file is not downloaded locally.
        </p>
        <button onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download'}
        </button>
        {downloadError && (
          <p style={{ color: 'var(--color-secondary)', fontSize: '12px' }}>{downloadError}</p>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      <h3>{track.title ?? track.filename}</h3>
      <p>{track.artist}</p>

      {track.waveformPeaks && (
        <svg width="100%" height="60" viewBox={`0 0 ${track.waveformPeaks.length} 100`} preserveAspectRatio="none">
          {track.waveformPeaks.map((peak, i) => (
            <rect key={i} x={i} y={50 - peak * 50} width={1} height={peak * 100} fill="var(--color-accent)" />
          ))}
        </svg>
      )}

      <Player src={track.path} />

      <div style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600 }}>Genre</div>
        {genres.map((g) => (
          <label key={g.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.genreIds.includes(g.id)}
              onChange={() => setTrackGenres(track.id, toggleInList(tags.genreIds, g.id))}
            />{' '}
            {g.name}
          </label>
        ))}
        <NewTagInput placeholder="New genre…" onCreate={createGenre} />

        <div style={{ fontWeight: 600, marginTop: '8px' }}>Sub-Genre</div>
        {availableSubgenres.map((sg) => (
          <label key={sg.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.subgenreIds.includes(sg.id)}
              onChange={() => setTrackSubgenres(track.id, toggleInList(tags.subgenreIds, sg.id))}
            />{' '}
            {sg.name}
          </label>
        ))}
        <NewTagInput
          placeholder={tags.genreIds[0] ? 'New sub-genre…' : 'Select a Genre first'}
          disabled={!tags.genreIds[0]}
          onCreate={(name) => createSubgenre(name, tags.genreIds[0])}
        />

        <div style={{ fontWeight: 600, marginTop: '8px' }}>Mood</div>
        {moods.map((m) => (
          <label key={m.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.moodIds.includes(m.id)}
              onChange={() => setTrackMoods(track.id, toggleInList(tags.moodIds, m.id))}
            />{' '}
            {m.name}
          </label>
        ))}
        <NewTagInput placeholder="New mood…" onCreate={createMood} />
      </div>
    </div>
  )
}
