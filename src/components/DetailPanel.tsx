// src/components/DetailPanel.tsx
//
// The track details: its sections live in ./detail/.
import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { decodeHtmlEntities } from '../format'
import type { Track } from '../types'
import { useSectionOpen, DetailSection } from './detail/DetailSection'
import { CoverSection } from './detail/CoverSection'
import { FullId3Section } from './detail/FileTagsSection'
import { TagPicker } from './detail/TagPicker'
import { SimilarTracksSection } from './detail/SimilarTracksSection'
import { useTrackPlaylistIds, PlaylistTagSuggestions, TrackPlaylistsSection } from './detail/TrackPlaylists'
import { FilePathSection } from './detail/FilePathSection'

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
