// src/components/detail/SimilarTracksSection.tsx
import { useMemo, useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { decodeHtmlEntities } from '../../format'
import type { Track } from '../../types'
import { camelotColor, formatKey, toCamelot } from '../../state/harmonic'
import { findSimilarTracks } from '../../state/similarTracks'
import { AddToPlaylistMenu } from '../AddToPlaylistMenu'
import { loadFlag, saveFlag, useSectionOpen, DetailSection } from './DetailSection'

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
export function SimilarTracksSection({ track, onSelectTrack }: { track: Track; onSelectTrack: (track: Track) => void }) {
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
