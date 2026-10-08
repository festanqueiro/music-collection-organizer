// src/components/DetailPanel.tsx
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useCollectionStore } from '../state/store'
import { REVEAL_IN_FILE_MANAGER } from '../platform'
import { ConfirmDialog } from './ConfirmDialog'
import { formatDuration, decodeHtmlEntities } from '../format'
import type { Track } from '../types'
import { camelotColor, formatKey, toCamelot } from '../state/harmonic'
import { findSimilarTracks } from '../state/similarTracks'
import { suggestTagsFromPlaylists, type PlaylistTagSuggestion } from '../state/playlistTagSuggestions'
import { playlistFolders } from '../state/savedPlaylist'
import { AddToPlaylistMenu } from './PlaylistsBox'
import { formatGain, formatLufs, gainToMatch, medianLoudness } from '../state/loudness'
import { guessTagsFromFilename } from '../state/filenameTags'

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

// Whether a section of the details is open, remembered between sessions
// (a per-viewer convenience, so localStorage). Every section starts open.
function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
function saveFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Non-essential preference — fine to lose.
  }
}
type SectionId = 'cover' | 'tags' | 'id3' | 'playlists' | 'similar' | 'file'
function useSectionOpen(id: SectionId): [boolean, () => void] {
  const key = `detailSection.${id}`
  const [open, setOpen] = useState(() => loadFlag(key, true))
  return [
    open,
    () => {
      saveFlag(key, !open)
      setOpen(!open)
    },
  ]
}

// One section of the details: a header that opens and closes it (the whole
// row is the button), an optional count, and controls on the right that
// only show while it is open.
function DetailSection({
  title,
  count,
  open,
  onToggle,
  actions,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section style={{ marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '6px', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '24px' }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          title={open ? `Hide ${title}` : `Show ${title}`}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            padding: '2px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-text-dim)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: '4px' }}>{count}</span>
          )}
        </button>
        {open && actions}
      </div>
      {open && <div style={{ marginTop: '4px' }}>{children}</div>}
    </section>
  )
}

// The cover embedded in the file.
function CoverSection({ artworkUrl }: { artworkUrl: string | null }) {
  const [open, toggleOpen] = useSectionOpen('cover')
  return (
    <DetailSection title="Cover" open={open} onToggle={toggleOpen}>
      {artworkUrl ? (
        <img
          src={artworkUrl}
          alt="Album artwork"
          style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '6px' }}
        />
      ) : (
        <div style={{ color: 'var(--color-text-dim)' }}>No cover in this file</div>
      )}
    </DetailSection>
  )
}

// The full set of ID3-derived metadata fields this app extracts.
// Title/Artist/Album/Genre/Year can be edited, which writes them into the
// file itself.
function FullId3Section({ track }: { track: Track }) {
  const [open, toggleOpen] = useSectionOpen('id3')
  // Volume Score: the gain to the collection's median loudness.
  const allTracks = useCollectionStore((s) => s.tracks)
  const loudnessTarget = useMemo(() => medianLoudness(allTracks.map((t) => t.loudness)), [allTracks])
  const gain = gainToMatch(track.loudness, loudnessTarget)
  const [draft, setDraft] = useState<TagDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags.get(track.id))
  const writeTrackTags = useCollectionStore((s) => s.writeTrackTags)
  const refreshTrackFileTags = useCollectionStore((s) => s.refreshTrackFileTags)
  const [opening, setOpening] = useState(false)

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

  // Suggestions from the filename, for fields the file leaves empty. Only
  // ever filled into the editor for review — never saved on their own.
  const guess = guessTagsFromFilename(track.filename)
  const suggested = (['artist', 'title', 'album'] as const).filter(
    (key) => guess[key] && !(key === 'title' ? track.title : key === 'artist' ? track.artist : track.album)?.trim()
  )

  // Opens the editor from the file's tags as they are right now (the row
  // may predate a read), optionally with suggestions filled into empty
  // fields.
  async function startEditing(withSuggestions: boolean) {
    setOpening(true)
    setError(null)
    await refreshTrackFileTags(track.id).catch(() => {})
    const latest = useCollectionStore.getState().tracks.find((t) => t.id === track.id) ?? track
    const next = draftFor(latest)
    if (withSuggestions) {
      for (const key of ['artist', 'title', 'album'] as const) if (!next[key].trim() && guess[key]) next[key] = guess[key]!
    }
    setDraft(next)
    setOpening(false)
  }

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
    ['Energy', track.energy !== null ? `${track.energy} / 10` : null],
    ['Loudness', track.loudness !== null ? `${formatLufs(track.loudness)} LUFS` : null],
    ['Volume Score', gain !== null ? formatGain(gain) : null],
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
    <DetailSection
      title="ID3 tags"
      open={open}
      onToggle={toggleOpen}
      actions={
        !draft && (
          <button
            onClick={() => startEditing(false)}
            disabled={!!editBlocked || opening}
            title={editBlocked ?? 'Edit these tags (writes them into the file)'}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              edit
            </span>
            Edit
          </button>
        )
      }
    >
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
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                artist: guess.artist ?? draft.artist,
                title: guess.title ?? draft.title,
                album: guess.album ?? draft.album,
              })
            }
            disabled={saving || (!guess.artist && !guess.title && !guess.album)}
            title="Fill Artist, Title and Album from the filename (review before saving)"
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              auto_fix_high
            </span>
            Fill from filename
          </button>
          {EDIT_FIELDS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>{label}</span>
              <span style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  disabled={saving}
                  autoFocus={key === 'title'}
                  placeholder={
                    key === 'artist' || key === 'title' || key === 'album' ? (guess[key] ?? undefined) : undefined
                  }
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
      {open && !draft && track.tagsRead && suggested.length > 0 && !editBlocked && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            borderRadius: '6px',
            border: '1px dashed var(--color-accent)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-accent)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              auto_fix_high
            </span>
            Suggested from the filename
          </span>
          {suggested.map((key) => (
            <span key={key}>
              <span style={{ color: 'var(--color-text-dim)' }}>{key === 'title' ? 'Title' : key === 'artist' ? 'Artist' : 'Album'}: </span>
              {guess[key]}
            </span>
          ))}
          <button
            onClick={() => startEditing(true)}
            disabled={opening}
            title="Opens the editor with these filled in — nothing is saved until you press Save to file"
            style={{ alignSelf: 'flex-start', fontSize: '12px', marginTop: '2px' }}
          >
            Review…
          </button>
        </div>
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
    </DetailSection>
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
          // A disabled picker (Subtag with no Tag yet) shows its placeholder,
          // never leftover text that would read like an assigned subtag.
          value={disabled ? '' : value}
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
  onSelectPlaylist,
  onSelectTrack,
}: {
  track: Track | null
  onClose: () => void
  onLocateInTable: (trackId: number) => void
  // Opens a playlist the track is in (the Playlists section).
  onSelectPlaylist: (playlistId: number) => void
  // Shows another track's details (a click in Similar tracks).
  onSelectTrack: (track: Track) => void
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
  const [tagsOpen, toggleTagsOpen] = useSectionOpen('tags')
  const playlistIds = useTrackPlaylistIds(selectedTrack && selectedTrack.cloudStatus !== 'cloud_only' ? selectedTrack.id : null)

  // Fetched on demand per selected track, not bulk-loaded with the rest of
  // the collection — see extractArtwork's own comment in the main process
  // for why. Re-fetches whenever the selected track changes; a stale
  // result from a track the user has since navigated away from is
  // discarded rather than applied.
  // What the file's tags really say — the row may never have had them read.
  const refreshTrackFileTags = useCollectionStore((s) => s.refreshTrackFileTags)
  useEffect(() => {
    if (!selectedTrack || selectedTrack.cloudStatus === 'cloud_only') return
    refreshTrackFileTags(selectedTrack.id).catch((err) => console.error('reading tags failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.id])

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
      // Downloading no longer analyses in the same step; this runs it in
      // the analysis worker.
      useCollectionStore.getState().runAnalysis([track.id]).catch((err) => console.error('analysis after download failed', err))
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

      {track.analysisStatus === 'error' && (
        // Why there's no BPM, key or waveform — and another go.
        <div
          role="status"
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            border: '1px solid var(--color-error)',
            borderRadius: '6px',
            fontSize: '12px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-error)' }}>
            error
          </span>
          <span style={{ flex: 1 }}>
            <strong>Analysis failed.</strong> {track.analysisError ?? 'No reason was recorded (analysed before MCO kept one).'}
          </span>
          <button onClick={() => void useCollectionStore.getState().runAnalysis([track.id])} style={{ fontSize: '12px', flexShrink: 0 }}>
            Try again
          </button>
        </div>
      )}

      <CoverSection artworkUrl={artworkUrl} />
      <FullId3Section track={track} />

      <DetailSection title="Tags" count={tags.genreIds.length + tags.subgenreIds.length} open={tagsOpen} onToggle={toggleTagsOpen}>
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
        {/* Keyed by track: text half-typed into a picker belongs to the track
            it was typed on, not the next one selected. */}
        <TagPicker
          key={`tag-${track.id}`}
          label="Tag"
          options={genres}
          selectedIds={tags.genreIds}
          placeholder="Select or type a new tag…"
          onToggle={(id) => setTrackGenres(track.id, toggleInList(tags.genreIds, id))}
          onCreate={applySuggestedGenre}
        />
        <TagPicker
          key={`subtag-${track.id}`}
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
        {tagsOpen && <PlaylistTagSuggestions trackId={track.id} playlistIds={playlistIds} genreIds={tags.genreIds} subgenreIds={tags.subgenreIds} />}
      </DetailSection>
      <TrackPlaylistsSection key={`playlists-${track.id}`} playlistIds={playlistIds} onSelectPlaylist={onSelectPlaylist} />
      <SimilarTracksSection key={`similar-${track.id}`} track={track} onSelectTrack={onSelectTrack} />
      <FilePathSection track={track} onTrashed={onClose} />
    </div>
  )
}

// Per-viewer conveniences for the Similar tracks section.
const SIMILAR_BY_KEY_KEY = 'similarTracksByKey'
const SIMILAR_BY_TAGS_KEY = 'similarTracksByTags'
const SIMILAR_BY_BPM_KEY = 'similarTracksByBpm'
const SIMILAR_PAGE = 8

const similarIconButtonStyle = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--color-text-dim)' }

// Tracks that mix harmonically with this one or share its Tags/Subtags
// (src/state/similarTracks.ts), best first, each with the table row's
// actions. Ranked only while the section is open, and only a page of rows
// is rendered, so it costs nothing when it isn't looked at.
function SimilarTracksSection({ track, onSelectTrack }: { track: Track; onSelectTrack: (track: Track) => void }) {
  const [open, toggleOpen] = useSectionOpen('similar')
  const [byKey, setByKey] = useState(() => loadFlag(SIMILAR_BY_KEY_KEY, true))
  const [byTags, setByTags] = useState(() => loadFlag(SIMILAR_BY_TAGS_KEY, true))
  // Off until asked for: a tempo alone matches a large part of a collection.
  const [byBpm, setByBpm] = useState(() => loadFlag(SIMILAR_BY_BPM_KEY, false))
  const [shown, setShown] = useState(SIMILAR_PAGE)
  const [playlistMenu, setPlaylistMenu] = useState<{ trackIds: number[]; x: number; y: number } | null>(null)
  const tracks = useCollectionStore((s) => s.tracks)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const playlist = useCollectionStore((s) => s.playlist)
  const cueTrackId = useCollectionStore((s) => s.cueTrackId)
  const playerPlaying = useCollectionStore((s) => s.playerPlaying)
  const hasKey = toCamelot(track.musicalKey) !== null
  const tags = trackTags.get(track.id)
  const hasTags = !!tags && tags.genreIds.length + tags.subgenreIds.length > 0
  const hasBpm = !!track.bpm
  const similar = useMemo(
    () => (open ? findSimilarTracks(track, tracks, trackTags, { byKey, byTags, byBpm }) : []),
    // The selected track's own key, tempo and tags are all that matter of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, track.id, track.musicalKey, track.bpm, tracks, trackTags, byKey, byTags, byBpm]
  )
  const genreNames = useMemo(() => new Map(genres.map((g) => [g.id, g.name])), [genres])
  const subgenreNames = useMemo(() => new Map(subgenres.map((s) => [s.id, s.name])), [subgenres])
  const queuedIds = useMemo(() => new Set(playlist.slice(1)), [playlist])
  const currentTrackId = playlist[0] ?? null

  const toggle = (label: string, on: boolean, available: boolean, set: (on: boolean) => void, storageKey: string, hint: string) => (
    <button
      onClick={() => {
        set(!on)
        saveFlag(storageKey, !on)
        setShown(SIMILAR_PAGE)
      }}
      disabled={!available}
      aria-pressed={on}
      title={available ? hint : `This track has no ${label === 'BPM' ? label : label.toLowerCase()} yet`}
      style={{
        fontSize: '11px',
        padding: '1px 8px',
        borderRadius: '99px',
        border: `1px solid ${on && available ? 'var(--color-accent)' : 'var(--color-border)'}`,
        color: on && available ? 'var(--color-accent)' : 'var(--color-text-dim)',
        background: 'none',
      }}
    >
      {label}
    </button>
  )

  return (
    <DetailSection
      title="Similar tracks"
      count={similar.length}
      open={open}
      onToggle={toggleOpen}
      actions={
        <span style={{ display: 'flex', gap: '4px' }}>
          {toggle('Key', byKey, hasKey, setByKey, SIMILAR_BY_KEY_KEY, 'The same key, one step round the wheel, or the relative major/minor')}
          {toggle('Tags', byTags, hasTags, setByTags, SIMILAR_BY_TAGS_KEY, 'Shares a Tag or Subtag with this track')}
          {toggle('BPM', byBpm, hasBpm, setByBpm, SIMILAR_BY_BPM_KEY, 'A tempo that mixes: within 6 %, or half/double time')}
        </span>
      }
    >
      {open && similar.length === 0 && (
        <div style={{ color: 'var(--color-text-dim)' }}>
          {!hasKey && !hasTags && !hasBpm
            ? 'Analyse this track or give it a Tag to find similar ones.'
            : !byKey && !byTags && !byBpm
              ? 'Switch on Key, Tags or BPM.'
              : 'Nothing similar found.'}
        </div>
      )}
      {open &&
        similar.slice(0, shown).map(({ track: other, key, bpmMixes, sharedGenreIds, sharedSubgenreIds }) => {
          const camelot = toCamelot(other.musicalKey)
          const keyLabel = formatKey(other.musicalKey, keyNotation)
          const shared = [...sharedGenreIds.map((id) => genreNames.get(id)), ...sharedSubgenreIds.map((id) => subgenreNames.get(id))].filter(Boolean)
          const isCurrent = other.id === currentTrackId
          const queued = queuedIds.has(other.id)
          const title = decodeHtmlEntities(other.title ?? other.filename)
          return (
            <div key={other.id} style={{ padding: '5px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  onClick={() => onSelectTrack(other)}
                  title={`Show details: ${title}${other.artist ? ` — ${decodeHtmlEntities(other.artist)}` : ''}`}
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  {title}
                  {other.artist && <span style={{ color: 'var(--color-text-dim)' }}> — {decodeHtmlEntities(other.artist)}</span>}
                </span>
                <button
                  onClick={() => {
                    const { playbackControls, playTrackNow } = useCollectionStore.getState()
                    // The loaded track's button is its play/pause toggle.
                    if (isCurrent && playbackControls) playbackControls.toggle()
                    else void playTrackNow(other.id)
                  }}
                  title={isCurrent && playerPlaying ? 'Pause' : isCurrent ? 'Resume' : 'Play track now'}
                  style={{ ...similarIconButtonStyle, ...(isCurrent ? { color: 'var(--color-accent)' } : {}) }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {isCurrent && playerPlaying ? 'pause_circle' : 'play_circle'}
                  </span>
                </button>
                <button
                  onClick={() => {
                    const store = useCollectionStore.getState()
                    store.addToPlaylist(other.id)
                    store.showToast(`Added "${title}" to the queue`)
                  }}
                  title={queued ? 'In the queue — add it again' : 'Add to queue'}
                  style={{ ...similarIconButtonStyle, ...(queued ? { color: 'var(--color-accent)' } : {}) }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {queued ? 'playlist_add_check' : 'playlist_add'}
                  </span>
                </button>
                {other.cloudStatus === 'local' && (
                  <button
                    onClick={() => useCollectionStore.getState().previewTrack(other.id)}
                    title={other.id === cueTrackId ? 'Stop pre-listen' : 'Pre-listen in headphones'}
                    style={{ ...similarIconButtonStyle, ...(other.id === cueTrackId ? { color: 'var(--color-accent)' } : {}) }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      headphones
                    </span>
                  </button>
                )}
                <button
                  onClick={(e) => setPlaylistMenu({ trackIds: [other.id], x: e.clientX, y: e.clientY })}
                  title="Add to playlist…"
                  style={similarIconButtonStyle}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    queue_music
                  </span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '11px', color: 'var(--color-text-dim)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {keyLabel && (
                  <span
                    title={key === 'same' ? 'Same key' : key === 'compatible' ? 'Compatible key' : "Doesn't mix by key"}
                    style={
                      camelot && key
                        ? { padding: '0 6px', borderRadius: '8px', background: camelotColor(camelot), color: '#fff', flexShrink: 0 }
                        : { flexShrink: 0 }
                    }
                  >
                    {keyLabel}
                  </span>
                )}
                {other.bpm && (
                  <span title={bpmMixes ? 'Tempo mixes' : undefined} style={{ flexShrink: 0, ...(bpmMixes ? { color: 'var(--color-text)' } : {}) }}>
                    {Math.round(other.bpm)} BPM
                  </span>
                )}
                {shared.length > 0 && (
                  <span title={`Shared: ${shared.join(', ')}`} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {shared.join(', ')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      {open && similar.length > shown && (
        <button onClick={() => setShown(shown + SIMILAR_PAGE * 2)} style={{ fontSize: '12px', marginTop: '6px' }}>
          Show more
        </button>
      )}
      {playlistMenu && <AddToPlaylistMenu {...playlistMenu} onClose={() => setPlaylistMenu(null)} />}
    </DetailSection>
  )
}

// The playlists the track is in, in the Playlists box's order; a click opens
// one. Keyed by track in the parent, so it never shows the last track's.
// The playlists a track is in (null until read, and for no track). Read
// again whenever the tree changes: adding or removing songs (here or
// anywhere else) replaces it. Read once in DetailPanel for the sections
// that show it — the Tags' suggestions and Playlists.
function useTrackPlaylistIds(trackId: number | null): number[] | null {
  const playlistNodes = useCollectionStore((s) => s.playlistNodes)
  const [read, setRead] = useState<{ trackId: number; ids: number[] } | null>(null)
  useEffect(() => {
    if (trackId === null) return
    let cancelled = false
    window.api
      .getTrackPlaylistIds(trackId)
      .then((ids) => {
        if (!cancelled) setRead({ trackId, ids })
      })
      .catch((err) => console.error("reading the track's playlists failed", err))
    return () => {
      cancelled = true
    }
  }, [trackId, playlistNodes])
  // Not the track before's while this one's are on their way.
  return read && read.trackId === trackId ? read.ids : null
}

// Under the Tag and Subtag boxes: Tags and Subtags named in the playlists
// the track is in (src/state/playlistTagSuggestions.ts). A click adds one;
// nothing is added on its own.
function PlaylistTagSuggestions({
  trackId,
  playlistIds,
  genreIds,
  subgenreIds,
}: {
  trackId: number
  playlistIds: number[] | null
  genreIds: number[]
  subgenreIds: number[]
}) {
  const playlistNodes = useCollectionStore((s) => s.playlistNodes)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const setTrackGenres = useCollectionStore((s) => s.setTrackGenres)
  const setTrackSubgenres = useCollectionStore((s) => s.setTrackSubgenres)
  const showToast = useCollectionStore((s) => s.showToast)
  const suggestions = useMemo(() => {
    const inIds = new Set(playlistIds ?? [])
    const names = playlistNodes.filter((n) => n.kind === 'playlist' && inIds.has(n.id)).map((n) => n.name)
    return suggestTagsFromPlaylists(names, genres, subgenres, { genreIds, subgenreIds })
  }, [playlistNodes, playlistIds, genres, subgenres, genreIds, subgenreIds])
  if (suggestions.length === 0) return null

  async function add(s: PlaylistTagSuggestion) {
    try {
      if (s.kind === 'tag') return await setTrackGenres(trackId, [...genreIds, s.id])
      // A Subtag needs its Tag on the track.
      if (s.parent?.missing) await setTrackGenres(trackId, [...genreIds, s.parent.id])
      await setTrackSubgenres(trackId, [...subgenreIds, s.id])
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '4px' }}>Suggested from its playlists</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {suggestions.map((s) => {
          const where = `In the playlist${s.playlists.length === 1 ? '' : 's'} ${s.playlists.map((p) => `“${p}”`).join(', ')}`
          const color = (s.kind === 'tag' ? genres.find((g) => g.id === s.id)?.color : subgenres.find((sg) => sg.id === s.id)?.color) ?? 'var(--color-border)'
          return (
            <button
              key={`${s.kind}-${s.id}`}
              onClick={() => void add(s)}
              title={`Add the ${s.kind === 'tag' ? 'Tag' : 'Subtag'} ${s.name}${s.parent?.missing ? ` (and its Tag ${s.parent.name})` : ''}. ${where}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                maxWidth: '100%',
                fontSize: '11px',
                padding: '1px 8px 1px 4px',
                borderRadius: '99px',
                border: `1px dashed ${color}`,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>
                add
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.parent && <span style={{ color: 'var(--color-text-dim)' }}>{s.parent.name} › </span>}
                {s.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TrackPlaylistsSection({ playlistIds, onSelectPlaylist }: { playlistIds: number[] | null; onSelectPlaylist: (playlistId: number) => void }) {
  const playlistNodes = useCollectionStore((s) => s.playlistNodes)
  const selectedPlaylistId = useCollectionStore((s) => s.selectedPlaylistId)
  const [open, toggleOpen] = useSectionOpen('playlists')
  const playlists = useMemo(() => {
    const byId = new Map(playlistNodes.map((n) => [n.id, n]))
    const inIds = new Set(playlistIds ?? [])
    return playlistNodes
      .filter((n) => inIds.has(n.id))
      .map((n) => {
        return { id: n.id, name: n.name, folders: playlistFolders(n, byId).join(' / ') }
      })
  }, [playlistNodes, playlistIds])
  return (
    <DetailSection title="Playlists" count={playlists.length} open={open} onToggle={toggleOpen}>
      {playlistIds !== null && playlists.length === 0 && <div style={{ color: 'var(--color-text-dim)' }}>Not in any playlist</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectPlaylist(p.id)}
            title={`Open ${p.folders ? `${p.folders} / ` : ''}${p.name}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '12px',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: '3px 0',
              cursor: 'pointer',
              color: p.id === selectedPlaylistId ? 'var(--color-accent)' : 'var(--color-text)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
              queue_music
            </span>
            {/* The name first and whole (two playlists in one folder differ
                only there); its folders small underneath, cut if long. */}
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ overflowWrap: 'anywhere' }}>{p.name}</span>
              {p.folders && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.folders}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </DetailSection>
  )
}

// The file's full path, at the very bottom — selectable, with shortcuts to
// copy it or reveal the file in Finder.
function FilePathSection({ track, onTrashed }: { track: Track; onTrashed: () => void }) {
  const [copied, setCopied] = useState(false)
  const [confirmingTrash, setConfirmingTrash] = useState(false)
  const [trashError, setTrashError] = useState<string | null>(null)
  const trashTrack = useCollectionStore((s) => s.trashTrack)
  const [open, toggleOpen] = useSectionOpen('file')
  useEffect(() => {
    setCopied(false)
    setConfirmingTrash(false)
    setTrashError(null)
  }, [track.id])
  return (
    <DetailSection title="File" open={open} onToggle={toggleOpen}>
      <div style={{ userSelect: 'text', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{track.path}</div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(track.path)
              .then(() => setCopied(true))
              .catch((err) => console.error('copying the path failed', err))
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied' : 'Copy path'}
        </button>
        <button
          onClick={() => window.api.showTrackInFolder(track.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            folder_open
          </span>
          {REVEAL_IN_FILE_MANAGER}
        </button>
        <button
          onClick={() => setConfirmingTrash(true)}
          title="Move this file to the Trash"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', marginLeft: 'auto', color: 'var(--color-error)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            delete
          </span>
          Delete
        </button>
      </div>
      {trashError && <div style={{ color: 'var(--color-error)', marginTop: '6px' }}>{trashError}</div>}
      {confirmingTrash && (
        <ConfirmDialog
          title="Delete this file?"
          icon="delete"
          confirmLabel="Move to Trash"
          onCancel={() => setConfirmingTrash(false)}
          onConfirm={async () => {
            setConfirmingTrash(false)
            const error = await trashTrack(track.id)
            if (error) setTrashError(error)
            else onTrashed()
          }}
        >
          <div style={{ color: 'var(--color-text)', fontWeight: 500, overflowWrap: 'anywhere' }}>
            {decodeHtmlEntities(track.title ?? track.filename)}
          </div>
          <div style={{ marginTop: '6px' }}>
            The file is moved to the Trash (and, in a synced folder, the cloud's trash), so it can be restored. It's
            removed from the collection and the queue; its tags come back if you restore it.
          </div>
        </ConfirmDialog>
      )}
    </DetailSection>
  )
}
