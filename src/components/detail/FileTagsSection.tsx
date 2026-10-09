// src/components/detail/FileTagsSection.tsx
import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { formatDuration, decodeHtmlEntities } from '../../format'
import type { Track } from '../../types'
import { formatKey } from '../../state/harmonic'
import { formatGain, formatLufs, gainToMatch, medianLoudness } from '../../state/loudness'
import { guessTagsFromFilename } from '../../state/filenameTags'
import { useSectionOpen, DetailSection } from './DetailSection'

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

// The full set of ID3-derived metadata fields this app extracts.
// Title/Artist/Album/Genre/Year can be edited, which writes them into the
// file itself.
export function FullId3Section({ track }: { track: Track }) {
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
    ['BPM', track.bpm ? `${Math.round(track.bpm * 100) / 100}${track.bpmEdited ? ' · set by you' : ''}` : null],
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
