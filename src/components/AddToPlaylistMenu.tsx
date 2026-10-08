// src/components/AddToPlaylistMenu.tsx
import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { contextMenuIconStyle, contextMenuItemStyle } from './contextMenuStyles'
import type { PlaylistNode } from '../types'
import { playlistFolders } from '../state/savedPlaylist'
import { songs } from '../format'
import { ContextMenu } from './ContextMenu'

// Recently added-to playlists shown above the full list in Add to playlist.
const RECENT_IN_MENU = 3

// "Add to playlist…" from the table's right-click menu: every playlist
// (with its folders as a path), and a new one.
export function AddToPlaylistMenu({ x, y, trackIds, onClose }: { x: number; y: number; trackIds: number[]; onClose: () => void }) {
  const nodes = useCollectionStore((s) => s.playlistNodes)
  const addTracks = useCollectionStore((s) => s.addTracksToSavedPlaylist)
  const createNode = useCollectionStore((s) => s.createPlaylistNode)
  const showToast = useCollectionStore((s) => s.showToast)
  const [naming, setNaming] = useState(false)
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [onClose])

  const recentIds = useCollectionStore((s) => s.recentPlaylistIds)
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const pathOf = (node: PlaylistNode): string => playlistFolders(node, byId).join(' / ')
  const playlists = nodes.filter((n) => n.kind === 'playlist')
  // The ones last added to, first; then the whole tree.
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((n): n is PlaylistNode => n?.kind === 'playlist')
    .slice(0, RECENT_IN_MENU)
  const item = (node: PlaylistNode, key: string) => (
    <button
      key={key}
      onClick={() => {
        onClose()
        void addTracks(node.id, trackIds)
      }}
      style={contextMenuItemStyle}
    >
      <span className="material-symbols-outlined" style={contextMenuIconStyle}>
        queue_music
      </span>
      <span>{node.name}</span>
      {node.parentId !== null && <span style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>{pathOf(node)}</span>}
    </button>
  )

  return (
    <ContextMenu x={x} y={y} onClose={onClose} style={{ maxHeight: '60vh', minWidth: '200px' }}>
      <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
        Add {songs(trackIds.length)} to…
      </div>
      {recent.length > 0 && playlists.length > recent.length && (
        <>
          {recent.map((node) => item(node, `recent-${node.id}`))}
          <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
        </>
      )}
      {playlists.map((node) => item(node, String(node.id)))}
      {naming ? (
        <input
          autoFocus
          placeholder="Playlist name"
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key !== 'Enter' || !e.currentTarget.value.trim()) return
            const name = e.currentTarget.value
            onClose()
            createNode('playlist', name, null)
              .then((id) => addTracks(id, trackIds))
              .catch((err) => showToast(err instanceof Error ? err.message : String(err)))
          }}
          style={{ margin: '4px', width: 'calc(100% - 8px)', height: '24px', padding: '0 6px' }}
        />
      ) : (
        <button onClick={() => setNaming(true)} style={contextMenuItemStyle}>
          <span className="material-symbols-outlined" style={contextMenuIconStyle}>
            add
          </span>
          New playlist…
        </button>
      )}
    </ContextMenu>
  )
}
