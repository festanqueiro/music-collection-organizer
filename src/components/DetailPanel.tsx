// src/components/DetailPanel.tsx
import { useEffect, useId, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { formatDuration, decodeHtmlEntities } from '../format'
import type { Track } from '../types'
import { formatKey } from '../state/harmonic'

// Formats whose tags MCO can write (see electron/main/tagWriter.ts).
const TAG_EDITABLE_FORMATS = ['mp3', 'aiff', 'aif', 'aifc', 'wav']

type TagDraft = { title: string; artist: string; album: string; genre: string; year: string }

function draftFor(track: Track): TagDraft {
  return {
    title: decodeHtmlEntities(track.title ?? ''),
    artist: decodeHtmlEntities(track.artist ?? ''),
    album: decodeHtmlEntities(track.album ?? ''),
    genre: decodeHtmlEntities(track.genreTag ?? ''),
    year: track.year ? String(track.year) : '',
  }
}

const EDIT_FIELDS: { key: keyof TagDraft; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'genre', label: 'Genre (ID3)' },
  { key: 'year', label: 'Year' },
]

// The full set of ID3-derived metadata fields this app extracts — expanded
// by default: checking a track's details is exactly the moment this
// reference info is wanted, so making the user open it every time added
// friction without protecting anything. Still collapsible for anyone who
// wants it out of the way. Title/Artist/Album/Genre/Year can be edited,
// which writes them into the file itself.
function FullId3Section({ track }: { track: Track }) {
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState<TagDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags.get(track.id))
  const writeTrackTags = useCollectionStore((s) => s.writeTrackTags)

  // Another track selected: drop an unsaved edit of the previous one.
  useEffect(() => {
    setDraft(null)
    setError(null)
  }, [track.id])

  const editBlocked =
    track.cloudStatus === 'cloud_only'
      ? 'Download the track to edit its tags'
      : !TAG_EDITABLE_FORMATS.includes(track.format.toLowerCase())
        ? `Editing tags in ${track.format.toUpperCase()} files isn't supported yet`
        : null

  // This track's Tags, then its Subtags — what "use tags" puts in Genre.
  const tagNames = [
    ...(trackTags?.genreIds ?? []).map((id) => genres.find((g) => g.id === id)?.name),
    ...(trackTags?.subgenreIds ?? []).map((id) => subgenres.find((sg) => sg.id === id)?.name),
  ].filter((name): name is string => !!name)

  const yearValid = !draft || /^\d{0,4}$/.test(draft.year.trim())

  async function save() {
    if (!draft || !yearValid) return
    setSaving(true)
    setError(null)
    const result = await writeTrackTags(track.id, {
      title: draft.title,
      artist: draft.artist,
      album: draft.album,
      genre: draft.genre,
      year: draft.year.trim() ? Number(draft.year.trim()) : null,
    })
    setSaving(false)
    if (result) setError(result)
    else setDraft(null)
  }

  const fields: [string, string | number | null][] = [
    ['Title', track.title ? decodeHtmlEntities(track.title) : null],
    ['Artist', track.artist ? decodeHtmlEntities(track.artist) : null],
    ['Album', track.album ? decodeHtmlEntities(track.album) : null],
    ['Genre (ID3)', track.genreTag ? decodeHtmlEntities(track.genreTag) : null],
    ['Year', track.year],
    ['BPM', track.bpm ? Math.round(track.bpm) : null],
    ['Key', formatKey(track.musicalKey, keyNotation)],
    ['Format', track.format],
    ['Duration', track.duration ? formatDuration(track.duration) : null],
  ]

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    padding: '3px 6px',
    color: 'var(--color-text)',
    fontSize: '12px',
  }

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
        {open && !draft && (
          <button
            onClick={() => {
              setDraft(draftFor(track))
              setError(null)
            }}
            disabled={!!editBlocked}
            title={editBlocked ?? 'Edit these tags (writes them into the file)'}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              edit
            </span>
            Edit
          </button>
        )}
      </div>
      {open && draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !saving) {
              e.stopPropagation()
              setDraft(null)
              setError(null)
            }
          }}
          style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}
        >
          {EDIT_FIELDS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>{label}</span>
              <span style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  disabled={saving}
                  autoFocus={key === 'title'}
                  inputMode={key === 'year' ? 'numeric' : undefined}
                  style={{
                    ...inputStyle,
                    borderColor: key === 'year' && !yearValid ? 'var(--color-error)' : 'var(--color-border)',
                  }}
                />
                {key === 'genre' && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, genre: tagNames.join(', ') })}
                    disabled={saving || tagNames.length === 0}
                    title={
                      tagNames.length > 0
                        ? `Use this track's Tags & Subtags: ${tagNames.join(', ')}`
                        : 'This track has no Tags or Subtags yet'
                    }
                    style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', fontSize: '12px', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                      sell
                    </span>
                    Use tags
                  </button>
                )}
              </span>
            </label>
          ))}
          {!yearValid && <span style={{ color: 'var(--color-error)' }}>Year should be up to 4 digits.</span>}
          {error && <span style={{ color: 'var(--color-error)' }}>{error}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setError(null)
              }}
              disabled={saving}
              style={{ fontSize: '12px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !yearValid}
              style={{
                fontSize: '12px',
                background: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
                border: '1px solid var(--color-accent)',
              }}
            >
              {saving ? 'Saving…' : 'Save to file'}
            </button>
          </div>
        </form>
      )}
      {open && !draft && (
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
            {decodeHtmlEntities(track.filename)}
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
          {decodeHtmlEntities(track.title ?? track.filename)}
        </h3>
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <p>{track.artist ? decodeHtmlEntities(track.artist) : null}</p>

      <div style={{ marginTop: '16px' }}>
        {suggestedGenreName && !suggestedGenreAlreadyApplied && (
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>
              Suggested: {decodeHtmlEntities(suggestedGenreName)}
            </span>{' '}
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
