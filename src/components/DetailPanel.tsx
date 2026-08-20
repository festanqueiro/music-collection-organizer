// src/components/DetailPanel.tsx
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'
import { Player } from './Player'

export function DetailPanel({ track }: { track: Track | null }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const setTrackGenres = useCollectionStore((s) => s.setTrackGenres)
  const setTrackSubgenres = useCollectionStore((s) => s.setTrackSubgenres)
  const setTrackMoods = useCollectionStore((s) => s.setTrackMoods)

  if (!track) return <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>Select a track</div>

  const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [], moodIds: [] }
  const availableSubgenres = subgenres.filter((sg) => tags.genreIds.includes(sg.genreId))

  function toggleInList(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  if (track.cloudStatus === 'cloud_only') {
    return (
      <div style={{ padding: '16px' }}>
        <h3>{track.filename}</h3>
        <p>
          <span className="material-symbols-outlined">cloud</span> This file is not downloaded locally.
        </p>
        <button onClick={() => window.api.downloadTrack(track.id, track.path)}>Download</button>
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
      </div>
    </div>
  )
}
