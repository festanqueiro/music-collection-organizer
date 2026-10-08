// src/components/detail/TrackPlaylists.tsx
import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { suggestTagsFromPlaylists, type PlaylistTagSuggestion } from '../../state/playlistTagSuggestions'
import { playlistFolders } from '../../state/savedPlaylist'
import { useSectionOpen, DetailSection } from './DetailSection'

// The playlists the track is in, in the Playlists box's order; a click opens
// one. Keyed by track in the parent, so it never shows the last track's.
// The playlists a track is in (null until read, and for no track). Read
// again whenever the tree changes: adding or removing songs (here or
// anywhere else) replaces it. Read once in DetailPanel for the sections
// that show it — the Tags' suggestions and Playlists.
export function useTrackPlaylistIds(trackId: number | null): number[] | null {
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
export function PlaylistTagSuggestions({
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

export function TrackPlaylistsSection({ playlistIds, onSelectPlaylist }: { playlistIds: number[] | null; onSelectPlaylist: (playlistId: number) => void }) {
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
