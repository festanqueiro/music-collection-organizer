// src/components/DetailPanel.tsx
import { useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'

function formatDuration(totalSeconds: number): string {
  const total = Math.round(totalSeconds)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// The full set of ID3-derived metadata fields this app extracts — collapsed
// by default since Genre/Sub-Genre/Mood management above is the primary,
// frequently-used surface; this is reference info for when you need it.
function FullId3Section({ track }: { track: Track }) {
  const [open, setOpen] = useState(false)
  const fields: [string, string | number | null][] = [
    ['Title', track.title],
    ['Artist', track.artist],
    ['Album', track.album],
    ['Genre (ID3)', track.genreTag],
    ['Year', track.year],
    ['BPM', track.bpm ? Math.round(track.bpm) : null],
    ['Key', track.musicalKey],
    ['Format', track.format],
    ['Duration', track.duration ? formatDuration(track.duration) : null],
  ]

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--color-text-dim)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
        Full ID3 tags
      </button>
      {open && (
        <table style={{ marginTop: '8px', fontSize: '12px', borderCollapse: 'collapse' }}>
          <tbody>
            {fields.map(([label, value]) => (
              <tr key={label}>
                <td style={{ color: 'var(--color-text-dim)', padding: '2px 12px 2px 0', verticalAlign: 'top' }}>
                  {label}
                </td>
                <td style={{ padding: '2px 0' }}>{value ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

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
      {error && <div style={{ color: 'var(--color-secondary)' }}>{error}</div>}
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
  const loadedTrackId = useCollectionStore((s) => s.loadedTrackId)
  const loadTrackInPlayer = useCollectionStore((s) => s.loadTrackInPlayer)
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

  // The raw ID3 genre tag (e.g. "House") is captured during analysis but
  // isn't a curated Genre until a user applies it — offer it as a one-click
  // suggestion rather than requiring it to be retyped by hand.
  const suggestedGenreName = track.genreTag?.trim() || null
  const suggestedGenreAlreadyApplied =
    !!suggestedGenreName &&
    genres.some(
      (g) => tags.genreIds.includes(g.id) && g.name.toLowerCase() === suggestedGenreName.toLowerCase()
    )

  async function applySuggestedGenre(name: string) {
    let genre = useCollectionStore.getState().genres.find((g) => g.name.toLowerCase() === name.toLowerCase())
    if (!genre) {
      await createGenre(name)
      genre = useCollectionStore.getState().genres.find((g) => g.name.toLowerCase() === name.toLowerCase())
    }
    if (genre) {
      await setTrackGenres(track.id, toggleInList(tags.genreIds, genre.id))
    }
  }

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await window.api.downloadTrack(track.id)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => loadTrackInPlayer(track.id)} title="Play">
          <span className="material-symbols-outlined">
            {track.id === loadedTrackId ? 'graphic_eq' : 'play_arrow'}
          </span>
        </button>
        <h3 style={{ margin: 0 }}>{track.title ?? track.filename}</h3>
      </div>
      <p>{track.artist}</p>

      <div style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600 }}>Genre</div>
        {suggestedGenreName && !suggestedGenreAlreadyApplied && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>Suggested: {suggestedGenreName}</span>{' '}
            <button onClick={() => applySuggestedGenre(suggestedGenreName)}>
              + Add
            </button>
          </div>
        )}
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

      <FullId3Section track={track} />
    </div>
  )
}
