// src/components/PlaylistsBox.tsx
//
// The sidebar's Playlists box (docs/features/playlists.md): under the
// Folders/Tags/Subtags/Filters views, whichever is open. A tree of folders
// and playlists; click a playlist to show its songs in the table, drop
// rows on one to add them, right-click to play, rename or delete.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { ConfirmDialog } from './ConfirmDialog'
import { contextMenuIconStyle, contextMenuItemStyle, contextMenuStyle } from './contextMenuStyles'
import type { PlaylistNode } from '../types'

const LAYOUT_KEY = 'playlistsBox'
const MIN_HEIGHT = 80
const DEFAULT_HEIGHT = 240
const HEADER_HEIGHT = 34

interface Layout {
  height: number
  collapsed: boolean
  // Folders the user closed; everything else is open.
  closed: number[]
}

function loadLayout(): Layout {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    return {
      height: typeof stored?.height === 'number' ? stored.height : DEFAULT_HEIGHT,
      collapsed: stored?.collapsed === true,
      closed: Array.isArray(stored?.closed) ? stored.closed.filter((id: unknown) => typeof id === 'number') : [],
    }
  } catch {
    return { height: DEFAULT_HEIGHT, collapsed: false, closed: [] }
  }
}

// A name being typed: a new node under `parentId`, or a rename of `id`.
type Editing = { kind: 'create'; nodeKind: PlaylistNode['kind']; parentId: number | null } | { kind: 'rename'; id: number }

const songs = (n: number) => `${n} song${n === 1 ? '' : 's'}`

export function PlaylistsBox({ onSelectPlaylist }: { onSelectPlaylist: (id: number) => void }) {
  const nodes = useCollectionStore((s) => s.playlistNodes)
  const selectedId = useCollectionStore((s) => s.selectedPlaylistId)
  const tracks = useCollectionStore((s) => s.tracks)
  const createNode = useCollectionStore((s) => s.createPlaylistNode)
  const renameNode = useCollectionStore((s) => s.renamePlaylistNode)
  const deleteNode = useCollectionStore((s) => s.deletePlaylistNode)
  const addTracks = useCollectionStore((s) => s.addTracksToSavedPlaylist)
  const playNode = useCollectionStore((s) => s.playPlaylistNode)
  const requestAddManyToQueue = useCollectionStore((s) => s.requestAddManyToQueue)
  const showToast = useCollectionStore((s) => s.showToast)

  const [layout, setLayout] = useState(loadLayout)
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // Not saved; the defaults come back next time.
    }
  }, [layout])
  const closed = useMemo(() => new Set(layout.closed), [layout.closed])

  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; node: PlaylistNode | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PlaylistNode | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const children = useMemo(() => {
    const map = new Map<number | null, PlaylistNode[]>()
    for (const node of nodes) map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    return map
  }, [nodes])

  const trackIdsByPath = useMemo(() => new Map(tracks.map((t) => [t.path, t.id])), [tracks])

  function toggleFolder(id: number) {
    setLayout((l) => ({ ...l, closed: closed.has(id) ? l.closed.filter((c) => c !== id) : [...l.closed, id] }))
  }

  function startCreate(nodeKind: PlaylistNode['kind'], parentId: number | null) {
    // The new name field shows inside its folder, so open it.
    if (parentId !== null && closed.has(parentId)) toggleFolder(parentId)
    setLayout((l) => ({ ...l, collapsed: false }))
    setEditing({ kind: 'create', nodeKind, parentId })
  }

  // Enter and the blur that follows both commit; only the first counts.
  const editingRef = useRef<Editing | null>(null)
  editingRef.current = editing
  async function commitEdit(name: string) {
    const edit = editingRef.current
    editingRef.current = null
    setEditing(null)
    if (!edit || !name.trim()) return
    try {
      if (edit.kind === 'rename') await renameNode(edit.id, name)
      else {
        const id = await createNode(edit.nodeKind, name, edit.parentId)
        if (edit.nodeKind === 'playlist') onSelectPlaylist(id)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err))
    }
  }

  // Rows dragged from the table arrive as files (a native drag, so they
  // can go to Finder too); files from the collection become its tracks.
  function dropFiles(playlistId: number, files: FileList) {
    const ids = [...files]
      .map((file) => trackIdsByPath.get(window.api.pathForFile(file)))
      .filter((id): id is number => id !== undefined)
    if (ids.length === 0) return showToast('Only songs in the collection can go in a playlist')
    void addTracks(playlistId, ids)
  }

  // Playlists inside a folder, however deep — for the delete confirmation.
  function countUnder(folderId: number): number {
    return (children.get(folderId) ?? []).reduce((sum, n) => sum + (n.kind === 'playlist' ? 1 : countUnder(n.id)), 0)
  }

  // Drag the top edge to share the pane with the tree above.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: layout.height }
    const move = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const max = window.innerHeight * 0.75
      setLayout((l) => ({ ...l, height: Math.round(Math.min(max, Math.max(MIN_HEIGHT, drag.startHeight + drag.startY - ev.clientY))) }))
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // A plain function, not a component, so re-renders keep the field.
  function nameInput(key: string | number, initial: string, depth: number) {
    return (
      <input
        key={key}
        autoFocus
        defaultValue={initial}
        placeholder={editing?.kind === 'create' && editing.nodeKind === 'folder' ? 'Folder name' : 'Playlist name'}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commitEdit(e.currentTarget.value)
          if (e.key === 'Escape') setEditing(null)
          // Keep the table's shortcuts (Space, P…) out of the field.
          e.stopPropagation()
        }}
        onBlur={(e) => void commitEdit(e.currentTarget.value)}
        style={{ width: `calc(100% - ${depth * 14 + 8}px)`, marginLeft: `${depth * 14 + 4}px`, height: '24px', padding: '0 6px' }}
      />
    )
  }

  function renderLevel(parentId: number | null, depth: number): React.ReactNode {
    const level = children.get(parentId) ?? []
    const creatingHere = editing?.kind === 'create' && editing.parentId === parentId
    return (
      <>
        {level.map((node) => {
          const isFolder = node.kind === 'folder'
          const open = isFolder && !closed.has(node.id)
          const selected = node.id === selectedId
          const isDrop = node.id === dropTarget
          if (editing?.kind === 'rename' && editing.id === node.id) return nameInput(node.id, node.name, depth)
          return (
            <div key={node.id}>
              <div
                onClick={() => (isFolder ? toggleFolder(node.id) : onSelectPlaylist(node.id))}
                onDoubleClick={() => setEditing({ kind: 'rename', id: node.id })}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, node })
                }}
                onDragOver={(e) => {
                  if (isFolder || !e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  if (dropTarget !== node.id) setDropTarget(node.id)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  dropFiles(node.id, e.dataTransfer.files)
                }}
                title={isFolder ? node.name : `${node.name} — ${songs(node.trackCount)}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '24px',
                  paddingLeft: `${depth * 14 + 2}px`,
                  paddingRight: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: isDrop ? 'var(--color-selected)' : selected ? 'var(--color-surface-raised)' : undefined,
                  outline: isDrop ? '1px solid var(--color-accent)' : undefined,
                  color: selected || isDrop ? 'var(--color-accent)' : undefined,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px', width: '14px', flexShrink: 0, opacity: isFolder ? 1 : 0 }}>
                  {open ? 'expand_more' : 'chevron_right'}
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', flexShrink: 0 }}>
                  {isFolder ? 'folder' : 'queue_music'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {!isFolder && (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{node.trackCount}</span>
                )}
              </div>
              {open && renderLevel(node.id, depth + 1)}
            </div>
          )
        })}
        {creatingHere && nameInput('new', '', depth)}
      </>
    )
  }

  const menuItem = (icon: string, label: string, action: () => void) => (
    <button
      key={label}
      onClick={() => {
        setMenu(null)
        action()
      }}
      style={contextMenuItemStyle}
    >
      <span className="material-symbols-outlined" style={contextMenuIconStyle}>
        {icon}
      </span>
      {label}
    </button>
  )

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        height: layout.collapsed ? HEADER_HEIGHT : layout.height,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {!layout.collapsed && (
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          style={{ position: 'absolute', top: '-3px', left: 0, right: 0, height: '6px', cursor: 'row-resize', zIndex: 1 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: HEADER_HEIGHT, padding: '0 8px 0 12px', flexShrink: 0 }}>
        <button
          onClick={() => setLayout((l) => ({ ...l, collapsed: !l.collapsed }))}
          title={layout.collapsed ? 'Show playlists' : 'Hide playlists'}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: 0, flex: 1, minWidth: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
            {layout.collapsed ? 'chevron_right' : 'expand_more'}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--color-text-dim)' }}>PLAYLISTS</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            setMenu({ x: rect.left, y: rect.bottom + 4, node: null })
          }}
          title="New playlist or folder"
          aria-label="New playlist or folder"
          style={{ display: 'flex', background: 'none', border: 'none', padding: '2px', color: 'var(--color-text-dim)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            add
          </span>
        </button>
      </div>
      {!layout.collapsed && (
        <div
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, node: null })
          }}
        >
          {nodes.length === 0 && !editing ? (
            <div style={{ color: 'var(--color-text-dim)', padding: '4px 4px', lineHeight: 1.6 }}>
              No playlists yet.{' '}
              <button
                onClick={() => startCreate('playlist', null)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', cursor: 'pointer' }}
              >
                New playlist
              </button>
            </div>
          ) : (
            renderLevel(null, 0)
          )}
        </div>
      )}

      {menu && (
        <div onClick={(e) => e.stopPropagation()} style={{ ...contextMenuStyle, top: menu.y, left: menu.x }}>
          {menu.node === null ? (
            <>
              {menuItem('queue_music', 'New playlist', () => startCreate('playlist', null))}
              {menuItem('create_new_folder', 'New folder', () => startCreate('folder', null))}
            </>
          ) : menu.node.kind === 'playlist' ? (
            <>
              {menuItem('play_arrow', 'Play playlist', () => void playNode(menu.node!.id))}
              {menuItem('playlist_add', 'Add to queue', () => {
                const node = menu.node!
                void window.api.getPlaylistTrackIds(node.id).then((ids) => {
                  const present = new Set(tracks.map((t) => t.id))
                  requestAddManyToQueue(ids.filter((id) => present.has(id)))
                })
              })}
              {menuItem('edit', 'Rename', () => setEditing({ kind: 'rename', id: menu.node!.id }))}
              {menuItem('delete', 'Delete playlist…', () => setConfirmDelete(menu.node))}
            </>
          ) : (
            <>
              {menuItem('play_arrow', 'Play folder', () => void playNode(menu.node!.id))}
              {menuItem('queue_music', 'New playlist here', () => startCreate('playlist', menu.node!.id))}
              {menuItem('create_new_folder', 'New folder here', () => startCreate('folder', menu.node!.id))}
              {menuItem('edit', 'Rename', () => setEditing({ kind: 'rename', id: menu.node!.id }))}
              {menuItem('delete', 'Delete folder…', () => setConfirmDelete(menu.node))}
            </>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.kind === 'playlist' ? 'Delete playlist' : 'Delete folder'}
          icon="delete"
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const node = confirmDelete
            setConfirmDelete(null)
            void deleteNode(node.id)
          }}
        >
          {confirmDelete.kind === 'playlist' ? (
            <p style={{ margin: 0 }}>
              Delete <strong style={{ color: 'var(--color-text)' }}>{confirmDelete.name}</strong>? Its{' '}
              {songs(confirmDelete.trackCount)} stay in your collection.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Delete the folder <strong style={{ color: 'var(--color-text)' }}>{confirmDelete.name}</strong>
              {countUnder(confirmDelete.id) > 0
                ? ` and the ${countUnder(confirmDelete.id)} playlist${countUnder(confirmDelete.id) === 1 ? '' : 's'} in it`
                : ''}
              ? The songs stay in your collection.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}

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

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const pathOf = (node: PlaylistNode): string => {
    const parts: string[] = []
    for (let p = node.parentId; p !== null; p = byId.get(p)?.parentId ?? null) parts.unshift(byId.get(p)?.name ?? '')
    return parts.join(' / ')
  }
  const playlists = nodes.filter((n) => n.kind === 'playlist')

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ ...contextMenuStyle, top: y, left: x, maxHeight: '60vh', overflowY: 'auto', minWidth: '200px' }}
    >
      <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
        Add {songs(trackIds.length)} to…
      </div>
      {playlists.map((node) => (
        <button
          key={node.id}
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
      ))}
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
    </div>
  )
}
