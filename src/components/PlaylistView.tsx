// src/components/PlaylistView.tsx
import { useState } from 'react'
import { useCollectionStore } from '../state/store'
import { FxPanel } from './FxPanel'

// Full-screen overlay above the toolbar/left/center/right grid areas while
// the footer Player (with its own compact transport strip and
// down-chevron trigger) stays mounted underneath — so playback is never
// interrupted by expanding/collapsing this view. Split 50/50: the queue on
// the left, FX (delay/reverb today, Dub Siren later) on the right — FX
// controls need real space to grow into, which the footer strip can't
// spare.
export function PlaylistView() {
  const playlist = useCollectionStore((s) => s.playlist)
  const tracks = useCollectionStore((s) => s.tracks)
  const continuousPlay = useCollectionStore((s) => s.continuousPlay)
  const setContinuousPlay = useCollectionStore((s) => s.setContinuousPlay)
  const advanceToNext = useCollectionStore((s) => s.advanceToNext)
  const playTrackNow = useCollectionStore((s) => s.playTrackNow)
  const removeFromPlaylist = useCollectionStore((s) => s.removeFromPlaylist)
  const movePlaylistItem = useCollectionStore((s) => s.movePlaylistItem)
  const setPlayerExpanded = useCollectionStore((s) => s.setPlayerExpanded)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const currentTrack = playlist[0] != null ? (tracks.find((t) => t.id === playlist[0]) ?? null) : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h3 style={{ margin: 0 }}>Playlist</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', marginLeft: '12px' }}>
          <input
            type="checkbox"
            checked={continuousPlay}
            onChange={(e) => setContinuousPlay(e.target.checked)}
          />
          Continuous play
        </label>
        <button onClick={() => advanceToNext()} disabled={playlist.length === 0} style={{ fontSize: '12px' }}>
          Play next
        </button>
        <button
          onClick={() => setPlayerExpanded(false)}
          title="Collapse playlist"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: '50%', overflowY: 'auto', borderRight: '1px solid var(--color-border)' }}>
          {playlist.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>
              Playlist is empty. Add tracks from the collection view via right-click.
            </div>
          ) : (
            playlist.map((trackId, index) => {
              const track = tracks.find((t) => t.id === trackId)
              const isCurrent = index === 0
              return (
                <div
                  key={`${trackId}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null && dragIndex !== index) movePlaylistItem(dragIndex, index)
                    setDragIndex(null)
                  }}
                  onDoubleClick={() => playTrackNow(trackId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'grab',
                    background: isCurrent ? 'var(--color-surface-raised)' : undefined,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
                    drag_indicator
                  </span>
                  {isCurrent && (
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-accent)' }}>
                      graphic_eq
                    </span>
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track ? (track.title ?? track.filename) : `Track ${trackId}`}
                  </span>
                  {track?.bpm && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{Math.round(track.bpm)} BPM</span>
                  )}
                  <button
                    onClick={() => removeFromPlaylist(index)}
                    title="Remove from playlist"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      close
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div style={{ width: '50%', overflowY: 'auto' }}>
          <FxPanel track={currentTrack} />
        </div>
      </div>
    </div>
  )
}
