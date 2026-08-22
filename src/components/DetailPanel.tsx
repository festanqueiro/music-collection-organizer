// src/components/DetailPanel.tsx
import { useEffect, useId, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { formatDuration } from '../format'
import type { Track } from '../types'

// The full set of ID3-derived metadata fields this app extracts — expanded
// by default: checking a track's details is exactly the moment this
// reference info is wanted, so making the user open it every time added
// friction without protecting anything. Still collapsible for anyone who
// wants it out of the way.
function FullId3Section({ track }: { track: Track }) {
  const [open, setOpen] = useState(true)
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

// One control for a track's genre/sub-genre/mood tags: badges for the
// currently-applied ones (each with an × to remove), and a single
// text input backed by a <datalist> of existing names — type to filter
// and pick from the dropdown, or type something new and press Enter/+Add
// to create it (then apply it) in one step. Replaces what used to be a
// full checkbox list per tag type plus a separate "new tag" input.
function TagPicker({
  label,
  options,
  selectedIds,
  disabled,
  placeholder,
  onToggle,
  onCreate,
}: {
  label: string
  options: { id: number; name: string }[]
  selectedIds: number[]
  disabled?: boolean
  placeholder: string
  onToggle: (id: number) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const datalistId = useId()
  const selected = options.filter((o) => selectedIds.includes(o.id))

  async function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    const existing = options.find((o) => o.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!selectedIds.includes(existing.id)) onToggle(existing.id)
      setValue('')
      return
    }
    try {
      setError(null)
      await onCreate(trimmed)
      setValue('')
    } catch {
      setError('Could not create — name may already exist.')
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginTop: '8px' }}>{label}</div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '4px 0' }}>
          {selected.map((o) => (
            <span
              key={o.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '2px 4px 2px 10px',
                fontSize: '12px',
              }}
            >
              {o.name}
              <button
                onClick={() => onToggle(o.id)}
                title={`Remove ${o.name}`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  close
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: '4px' }}>
        <input
          type="text"
          list={datalistId}
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
        <datalist id={datalistId}>
          {options.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
        <button onClick={submit} disabled={disabled || !value.trim()}>
          + Add
        </button>
        {error && <div style={{ color: 'var(--color-secondary)' }}>{error}</div>}
      </div>
    </div>
  )
}

export function DetailPanel({
  track: selectedTrack,
  onClose,
  onLocateInTable,
}: {
  track: Track | null
  onClose: () => void
  onLocateInTable: (trackId: number) => void
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const loadAll = useCollectionStore((s) => s.loadAll)
  const setTrackGenres = useCollectionStore((s) => s.setTrackGenres)
  const setTrackSubgenres = useCollectionStore((s) => s.setTrackSubgenres)
  const createGenre = useCollectionStore((s) => s.createGenre)
  const createSubgenre = useCollectionStore((s) => s.createSubgenre)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)

  // Fetched on demand per selected track, not bulk-loaded with the rest of
  // the collection — see extractArtwork's own comment in the main process
  // for why. Re-fetches whenever the selected track changes; a stale
  // result from a track the user has since navigated away from is
  // discarded rather than applied.
  useEffect(() => {
    if (!selectedTrack) return
    let cancelled = false
    setArtworkUrl(null)
    window.api.getTrackArtwork(selectedTrack.id).then((url) => {
      if (!cancelled) setArtworkUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [selectedTrack?.id])

  if (!selectedTrack) return <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>Select a track</div>

  // Re-derive from the live store on every render so this panel reflects
  // updates (e.g. after a download+analyze, or a tag edit) without needing
  // the caller to re-select the row. Falls back to the prop in case the
  // track briefly isn't in `tracks` yet (e.g. mid-reload).
  const track = tracks.find((t) => t.id === selectedTrack.id) ?? selectedTrack

  const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [] }
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3
            onClick={() => onLocateInTable(track.id)}
            title="Scroll to this track in the collection table"
            style={{ margin: 0, cursor: 'pointer' }}
          >
            {track.filename}
          </h3>
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
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
        <h3
          onClick={() => onLocateInTable(track.id)}
          title="Scroll to this track in the collection table"
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          {track.title ?? track.filename}
        </h3>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <p>{track.artist}</p>

      <div style={{ marginTop: '16px' }}>
        {suggestedGenreName && !suggestedGenreAlreadyApplied && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>Suggested: {suggestedGenreName}</span>{' '}
            <button onClick={() => applySuggestedGenre(suggestedGenreName)}>
              + Add
            </button>
          </div>
        )}
        <TagPicker
          label="Tag"
          options={genres}
          selectedIds={tags.genreIds}
          placeholder="Select or type a new tag…"
          onToggle={(id) => setTrackGenres(track.id, toggleInList(tags.genreIds, id))}
          onCreate={applySuggestedGenre}
        />
        <TagPicker
          label="Subtag"
          options={availableSubgenres}
          selectedIds={tags.subgenreIds}
          disabled={!tags.genreIds[0]}
          placeholder={tags.genreIds[0] ? 'Select or type a new subtag…' : 'Select a Tag first'}
          onToggle={(id) => setTrackSubgenres(track.id, toggleInList(tags.subgenreIds, id))}
          onCreate={async (name) => {
            if (!tags.genreIds[0]) return
            await createSubgenre(name, tags.genreIds[0])
            const subgenre = useCollectionStore
              .getState()
              .subgenres.find((sg) => sg.genreId === tags.genreIds[0] && sg.name.toLowerCase() === name.toLowerCase())
            if (subgenre) await setTrackSubgenres(track.id, toggleInList(tags.subgenreIds, subgenre.id))
          }}
        />
      </div>

      {artworkUrl && (
        <img
          src={artworkUrl}
          alt="Album artwork"
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            borderRadius: '6px',
            marginTop: '16px',
          }}
        />
      )}

      <FullId3Section track={track} />
    </div>
  )
}
