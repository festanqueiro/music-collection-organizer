// src/components/PlaylistView.tsx
import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { formatDuration, decodeHtmlEntities } from '../format'
import { formatKey } from '../state/harmonic'
import { contextMenuStyle, contextMenuItemStyle, contextMenuIconStyle } from './contextMenuStyles'

// Fetched lazily and cached across the whole queue, not per-row state —
// the same track can appear (and its row remount) any number of times as
// the queue reorders, and re-fetching art on every remount would mean a
// data-URL-sized IPC round trip each time. Module-level (not component
// state) so the cache survives PlaylistView itself unmounting/remounting
// (collapsing and re-expanding the queue).
const artworkCache = new Map<number, string | null>()

// Approximate size of the queue entry's right-click menu, for keeping it
// inside the window.
const QUEUE_MENU_HEIGHT = 100
const QUEUE_MENU_WIDTH = 220

function useTrackArtwork(trackId: number | undefined): string | null {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    if (trackId == null || artworkCache.has(trackId)) return
    let cancelled = false
    window.api.getTrackArtwork(trackId).then((url) => {
      if (cancelled) return
      artworkCache.set(trackId, url)
      forceUpdate((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [trackId])
  return trackId != null ? (artworkCache.get(trackId) ?? null) : null
}

function QueueRow({
  trackId,
  isCurrent,
  track,
  playbackProgress,
  onDragStartRow,
  onDropRow,
  onDoubleClickRow,
  onContextMenuRow,
  onRemove,
}: {
  trackId: number
  isCurrent: boolean
  track: import('../types').Track | undefined
  playbackProgress: number
  onDragStartRow: () => void
  onDropRow: () => void
  onDoubleClickRow: () => void
  onContextMenuRow: (e: React.MouseEvent) => void
  onRemove: () => void
}) {
  const artworkUrl = useTrackArtwork(track?.id)
  const keyNotation = useCollectionStore((s) => s.keyNotation)

  return (
    <div
      draggable
      onDragStart={onDragStartRow}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropRow()
      }}
      onDoubleClick={onDoubleClickRow}
      onContextMenu={onContextMenuRow}
      style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'grab',
        background: isCurrent ? 'var(--color-surface-raised)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
          drag_indicator
        </span>
        {isCurrent && (
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-accent)' }}>
            graphic_eq
          </span>
        )}
        {artworkUrl && (
          <img
            src={artworkUrl}
            alt=""
            style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }}
          />
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track ? decodeHtmlEntities(track.title ?? track.filename) : `Track ${trackId}`}
          {track?.artist && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)' }}> — {decodeHtmlEntities(track.artist)}</span>
          )}
        </span>
        {track?.musicalKey && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{formatKey(track.musicalKey, keyNotation)}</span>
        )}
        {track?.bpm && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{Math.round(track.bpm)} BPM</span>
        )}
        {track?.duration && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{formatDuration(track.duration)}</span>
        )}
        <button onClick={onRemove} title="Remove from queue" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            close
          </span>
        </button>
      </div>
      {isCurrent && (
        <div style={{ marginTop: '6px', height: '2px', background: 'var(--color-border)', borderRadius: '1px' }}>
          <div
            style={{
              width: `${playbackProgress * 100}%`,
              height: '100%',
              background: 'var(--color-accent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

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
  const removeFromPlaylist = useCollectionStore((s) => s.removeFromPlaylist)
  const clearPlaylist = useCollectionStore((s) => s.clearPlaylist)
  const movePlaylistItem = useCollectionStore((s) => s.movePlaylistItem)
  const shufflePlaylist = useCollectionStore((s) => s.shufflePlaylist)
  const playQueueItemNow = useCollectionStore((s) => s.playQueueItemNow)
  const playQueueItemNext = useCollectionStore((s) => s.playQueueItemNext)
  const setPlayerScreen = useCollectionStore((s) => s.setPlayerScreen)
  const playbackProgress = useCollectionStore((s) => s.playbackProgress)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // trackId is kept alongside index so an action from a menu opened just
  // before the queue shifted (current track ended, etc.) doesn't hit
  // whichever entry has since slid into that index.
  const [contextMenu, setContextMenu] = useState<{ index: number; trackId: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    // Same reasoning as TrackTable's menu: no window 'contextmenu'
    // listener, since right-clicking another row reopens the menu itself.
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  function runMenuAction(action: (index: number) => void) {
    if (contextMenu && playlist[contextMenu.index] === contextMenu.trackId) action(contextMenu.index)
    setContextMenu(null)
  }


  const totalDuration = useMemo(() => {
    return playlist.reduce((sum, trackId) => sum + (tracks.find((t) => t.id === trackId)?.duration ?? 0), 0)
  }, [playlist, tracks])

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
        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-accent)' }}>
          queue_music
        </span>
        <h3 style={{ margin: 0 }}>Queue</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', marginLeft: '12px' }}>
          <input
            type="checkbox"
            checked={continuousPlay}
            onChange={(e) => setContinuousPlay(e.target.checked)}
          />
          Continuous play
        </label>
        <button
          onClick={() => advanceToNext()}
          disabled={playlist.length === 0}
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>skip_next</span>
          Play next in queue
        </button>
        <button
          onClick={() => clearPlaylist()}
          disabled={playlist.length <= 1}
          title="Remove every upcoming track (the current track stays)"
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>clear_all</span>
          Clear queue
        </button>
        <button
          onClick={() => shufflePlaylist()}
          disabled={playlist.length <= 2}
          title="Shuffle upcoming tracks (the current track keeps playing)"
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>shuffle</span>
          Shuffle
        </button>
        {playlist.length > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
            {playlist.length} track{playlist.length === 1 ? '' : 's'} · {formatDuration(totalDuration)} total
          </span>
        )}
        <button
          onClick={() => setPlayerScreen(null)}
          title="Close queue"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {playlist.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>
              Queue is empty. Add tracks from the collection view via right-click.
            </div>
          ) : (
            playlist.map((trackId, index) => (
              <QueueRow
                key={`${trackId}-${index}`}
                trackId={trackId}
                isCurrent={index === 0}
                track={tracks.find((t) => t.id === trackId)}
                playbackProgress={playbackProgress}
                onDragStartRow={() => setDragIndex(index)}
                onDropRow={() => {
                  if (dragIndex !== null && dragIndex !== index) movePlaylistItem(dragIndex, index)
                  setDragIndex(null)
                }}
                onDoubleClickRow={() => playQueueItemNow(index)}
                onContextMenuRow={(e) => {
                  e.preventDefault()
                  setContextMenu({ index, trackId, x: e.clientX, y: e.clientY })
                }}
                onRemove={() => removeFromPlaylist(index)}
              />
            ))
          )}
        </div>

      </div>

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            ...contextMenuStyle,
            // Keep it on screen when opened on one of the last rows / near
            // the right edge (it's ~3 items tall).
            top: Math.min(contextMenu.y, window.innerHeight - QUEUE_MENU_HEIGHT),
            left: Math.min(contextMenu.x, window.innerWidth - QUEUE_MENU_WIDTH),
          }}
        >
          {/* Neither applies to the entry that's already playing. */}
          {contextMenu.index > 0 && (
            <>
              <button onClick={() => runMenuAction(playQueueItemNow)} style={contextMenuItemStyle}>
                <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                  play_arrow
                </span>
                Play track now
              </button>
              <button
                onClick={() => runMenuAction(playQueueItemNext)}
                disabled={contextMenu.index === 1}
                title={contextMenu.index === 1 ? 'Already next in the queue' : undefined}
                style={{ ...contextMenuItemStyle, opacity: contextMenu.index === 1 ? 0.5 : 1 }}
              >
                <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                  skip_next
                </span>
                Add to top of the queue
              </button>
            </>
          )}
          <button onClick={() => runMenuAction(removeFromPlaylist)} style={contextMenuItemStyle}>
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              close
            </span>
            Remove from queue
          </button>
        </div>
      )}
    </div>
  )
}
