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
import { onMenuCommand, runMenuCommand } from '../menuCommands'
import type { PlaylistNode, RekordboxDuplicateAction, RekordboxImportDestination, RekordboxImportPlan } from '../types'
import { filterPlaylistNodes } from '../state/savedPlaylist'
import { songs } from '../format'
import { RekordboxImportSummary } from './RekordboxImportSummary'

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

// The collapsed sidebar's playlist icon: the box opens expanded when the
// sidebar comes back (it isn't mounted while collapsed, and reads its
// layout on mount).
export function expandPlaylistsBoxOnNextOpen(): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...loadLayout(), collapsed: false }))
  } catch {
    // The box keeps its last state.
  }
}

// A name being typed: a new node under `parentId`, or a rename of `id`.
type Editing = { kind: 'create'; nodeKind: PlaylistNode['kind']; parentId: number | null } | { kind: 'rename'; id: number }

// Playlists and folders dragged inside the box (rows from the table come
// as files instead).
const NODE_TYPE = 'application/x-mco-playlist-node'
type DropWhere = 'before' | 'after' | 'into'

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
  // The search field under the header: null while it's closed.
  const [query, setQuery] = useState<string | null>(null)
  const visible = useMemo(() => filterPlaylistNodes(nodes, query ?? ''), [nodes, query])
  const [menu, setMenu] = useState<{ x: number; y: number; node: PlaylistNode | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PlaylistNode | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [nodeDrop, setNodeDrop] = useState<{ id: number | null; where: DropWhere } | null>(null)

  async function moveNode(id: number, targetId: number | null, where: DropWhere) {
    try {
      useCollectionStore.setState({ playlistNodes: await window.api.movePlaylistNode(id, targetId, where) })
      if (where === 'into' && targetId !== null && closed.has(targetId)) toggleFolder(targetId)
    } catch (err) {
      showToast(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    }
  }

  // Where a node dropped on `node` lands: a folder takes it in unless it's
  // near its top or bottom edge; a playlist puts it before or after itself.
  function dropWhere(e: React.DragEvent, node: PlaylistNode): DropWhere {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - rect.top) / rect.height
    if (node.kind === 'folder') return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
    return y < 0.5 ? 'before' : 'after'
  }
  const [importPlan, setImportPlan] = useState<{ filePaths: string[]; plan: RekordboxImportPlan } | null>(null)
  // Songs found at another path that the user unticked (by their old path).
  const [rejectedRelinks, setRejectedRelinks] = useState<Set<string>>(new Set())
  // What to do with incoming playlists MCO already seems to have, by key:
  // skip when the songs are the same, otherwise import as new — unless
  // the user picks otherwise.
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, RekordboxDuplicateAction>>({})
  // Where the import's new playlists go; the Rekordbox folder unless chosen.
  const [destination, setDestination] = useState<RekordboxImportDestination>({ kind: 'rekordbox' })

  async function pickImport() {
    const picked = await window.api.pickRekordboxImport()
    if (!picked) return
    if ('error' in picked) return showToast(picked.error)
    if (picked.plan.playlists.length === 0) return showToast('No playlists in that file')
    setRejectedRelinks(new Set())
    setDestination({ kind: 'rekordbox' })
    setDuplicateChoices(
      Object.fromEntries(
        picked.plan.playlists.filter((p) => p.duplicate).map((p) => [p.key, p.duplicate!.songs === 'same' ? 'skip' : 'new'])
      )
    )
    setImportPlan(picked)
  }

  async function runImport(
    filePaths: string[],
    relinks: { from: string; trackId: number }[],
    duplicates: Record<string, { action: RekordboxDuplicateAction; targetId?: number }>,
    into: RekordboxImportDestination
  ) {
    try {
      useCollectionStore.setState({ playlistNodes: await window.api.importRekordbox(filePaths, relinks, duplicates, into) })
      const selected = useCollectionStore.getState().selectedPlaylistId
      if (selected !== null) void useCollectionStore.getState().selectPlaylist(selected)
      showToast('Imported from Rekordbox')
    } catch (err) {
      showToast(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    }
  }

  // F2 renames the selected playlist, outside text fields.
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'F2' || modalOpen || selectedId === null) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      e.preventDefault()
      // The name field shows in the tree, so open the folders around it.
      const parents = new Set<number>()
      for (let p = nodes.find((n) => n.id === selectedId)?.parentId ?? null; p !== null; p = nodes.find((n) => n.id === p)?.parentId ?? null) {
        parents.add(p)
      }
      setLayout((l) => ({ ...l, collapsed: false, closed: l.closed.filter((id) => !parents.has(id)) }))
      // The search might be hiding it.
      setQuery(null)
      setEditing({ kind: 'rename', id: selectedId })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, selectedId, nodes])

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
    // The search might be hiding the folder it goes in.
    setQuery(null)
    setEditing({ kind: 'create', nodeKind, parentId })
  }

  // File → New Playlist / Import Playlists from Rekordbox… in the menu bar.
  const startCreateRef = useRef(startCreate)
  startCreateRef.current = startCreate
  const pickImportRef = useRef(pickImport)
  pickImportRef.current = pickImport
  useEffect(() => {
    const offNew = onMenuCommand('new-playlist', () => startCreateRef.current('playlist', null))
    const offImport = onMenuCommand('import-rekordbox', () => void pickImportRef.current())
    return () => {
      offNew()
      offImport()
    }
  }, [])

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
    const level = (children.get(parentId) ?? []).filter((node) => !visible || visible.has(node.id))
    const creatingHere = editing?.kind === 'create' && editing.parentId === parentId
    return (
      <>
        {level.map((node) => {
          const isFolder = node.kind === 'folder'
          // A search opens every folder it shows.
          const open = isFolder && (visible !== null || !closed.has(node.id))
          const selected = node.id === selectedId
          const isDrop = node.id === dropTarget
          if (editing?.kind === 'rename' && editing.id === node.id) return nameInput(node.id, node.name, depth)
          return (
            <div key={node.id}>
              <div
                onClick={() => (isFolder ? visible === null && toggleFolder(node.id) : onSelectPlaylist(node.id))}
                onDoubleClick={() => setEditing({ kind: 'rename', id: node.id })}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, node })
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(NODE_TYPE, String(node.id))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => setNodeDrop(null)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(NODE_TYPE)) {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    const where = dropWhere(e, node)
                    if (nodeDrop?.id !== node.id || nodeDrop.where !== where) setNodeDrop({ id: node.id, where })
                    return
                  }
                  if (isFolder || !e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  // As the folder tree: the rows' native file drag offers a move.
                  e.dataTransfer.dropEffect = 'move'
                  if (dropTarget !== node.id) setDropTarget(node.id)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDropTarget(null)
                  const moved = e.dataTransfer.getData(NODE_TYPE)
                  if (moved) {
                    setNodeDrop(null)
                    if (Number(moved) !== node.id) void moveNode(Number(moved), node.id, dropWhere(e, node))
                    return
                  }
                  if (!isFolder) dropFiles(node.id, e.dataTransfer.files)
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
                  background:
                    isDrop || (nodeDrop?.id === node.id && nodeDrop.where === 'into')
                      ? 'var(--color-selected)'
                      : selected
                        ? 'var(--color-surface-raised)'
                        : undefined,
                  outline: isDrop || (nodeDrop?.id === node.id && nodeDrop.where === 'into') ? '1px solid var(--color-accent)' : undefined,
                  // A line where a dragged playlist or folder will land.
                  boxShadow:
                    nodeDrop?.id === node.id && nodeDrop.where !== 'into'
                      ? `inset 0 ${nodeDrop.where === 'before' ? '2px' : '-2px'} 0 var(--color-accent)`
                      : undefined,
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

  // The two items a playlist's menu and a folder's share. A folder exports
  // one .m3u8 per playlist in it.
  const exportM3uItem = (node: PlaylistNode, label: string) =>
    menuItem('ios_share', label, () =>
      void window.api
        .exportPlaylistM3u(node.id)
        .then((r) => {
          if (!r) return
          showToast(
            r.files === 1
              ? `Exported ${songs(r.songs)} — in Rekordbox: File → Import → Import Playlist`
              : `Exported ${r.files} playlists — in Rekordbox: File → Import → Import Playlist`
          )
        })
        .catch((err) => showToast(err instanceof Error ? err.message : String(err)))
    )
  const keepAsOwnItem = (node: PlaylistNode) =>
    node.source === 'rekordbox' &&
    menuItem('link_off', 'Keep as my own', () => {
      void window.api.detachPlaylistNode(node.id).then((nodes) => useCollectionStore.setState({ playlistNodes: nodes }))
      showToast(`${node.name} won't be refreshed from Rekordbox any more`)
    })

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
        {nodes.length > 0 && (
          <button
            onClick={() => {
              setLayout((l) => ({ ...l, collapsed: false }))
              setQuery((q) => (q === null ? '' : null))
            }}
            title={query === null ? 'Search playlists' : 'Close the search'}
            aria-label="Search playlists"
            aria-pressed={query !== null}
            style={{
              display: 'flex',
              background: 'none',
              border: 'none',
              padding: '2px',
              color: query !== null ? 'var(--color-accent)' : 'var(--color-text-dim)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              search
            </span>
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            setMenu({ x: rect.left, y: rect.bottom + 4, node: null })
          }}
          title="New playlist or folder, Rekordbox import and export"
          aria-label="New playlist or folder"
          style={{ display: 'flex', background: 'none', border: 'none', padding: '2px', color: 'var(--color-text-dim)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            add
          </span>
        </button>
      </div>
      {!layout.collapsed && query !== null && (
        <div style={{ flexShrink: 0, padding: '0 8px 6px' }}>
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search playlists"
            aria-label="Search playlists"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery(null)
              // Keep the table's shortcuts (Space, P…) out of the field.
              e.stopPropagation()
            }}
            style={{ width: '100%', height: '24px', padding: '0 6px' }}
          />
        </div>
      )}
      {!layout.collapsed && (
        <div
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, node: null })
          }}
          // Dropped below the tree: to the end of the top level.
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(NODE_TYPE)) return
            e.preventDefault()
            if (nodeDrop?.id !== null) setNodeDrop({ id: null, where: 'into' })
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNodeDrop(null)
          }}
          onDrop={(e) => {
            const moved = e.dataTransfer.getData(NODE_TYPE)
            setNodeDrop(null)
            if (!moved) return
            e.preventDefault()
            void moveNode(Number(moved), null, 'into')
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
          ) : visible?.size === 0 && !editing ? (
            <div style={{ color: 'var(--color-text-dim)', padding: '4px 4px' }}>No playlist or folder with that name.</div>
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
              {menuItem('download', 'Import from Rekordbox (xml, m3u8)…', () => void pickImport())}
              {menuItem('ios_share', 'Export collection to Rekordbox (xml)…', () => runMenuCommand('export-rekordbox'))}
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
              {exportM3uItem(menu.node, 'Export for Rekordbox (m3u8)…')}
              {menuItem('edit', 'Rename', () => setEditing({ kind: 'rename', id: menu.node!.id }))}
              {keepAsOwnItem(menu.node)}
              {menuItem('delete', 'Delete playlist…', () => setConfirmDelete(menu.node))}
            </>
          ) : (
            <>
              {menuItem('play_arrow', 'Play folder', () => void playNode(menu.node!.id))}
              {menuItem('queue_music', 'New playlist here', () => startCreate('playlist', menu.node!.id))}
              {menuItem('create_new_folder', 'New folder here', () => startCreate('folder', menu.node!.id))}
              {exportM3uItem(menu.node, 'Export playlists for Rekordbox (m3u8)…')}
              {menuItem('edit', 'Rename', () => setEditing({ kind: 'rename', id: menu.node!.id }))}
              {keepAsOwnItem(menu.node)}
              {menuItem('delete', 'Delete folder…', () => setConfirmDelete(menu.node))}
            </>
          )}
        </div>
      )}

      {importPlan && (
        <ConfirmDialog
          title="Import from Rekordbox"
          icon="download"
          confirmLabel="Import"
          width="480px"
          onCancel={() => setImportPlan(null)}
          onConfirm={() => {
            const { filePaths, plan } = importPlan
            if (destination.kind === 'new' && !destination.name.trim()) return showToast('Give the new folder a name')
            setImportPlan(null)
            void runImport(
              filePaths,
              plan.relinks.filter((r) => !rejectedRelinks.has(r.from)).map((r) => ({ from: r.from, trackId: r.trackId })),
              Object.fromEntries(
                plan.playlists
                  .filter((p) => p.duplicate && duplicateChoices[p.key])
                  .map((p) => [p.key, { action: duplicateChoices[p.key], targetId: p.duplicate!.id }])
              ),
              destination
            )
          }}
        >
          <RekordboxImportSummary
            plan={importPlan.plan}
            nodes={nodes}
            destination={destination}
            onDestination={setDestination}
            rejected={rejectedRelinks}
            onToggle={(from) =>
              setRejectedRelinks((prev) => {
                const next = new Set(prev)
                if (!next.delete(from)) next.add(from)
                return next
              })
            }
            onSetAll={(on) => setRejectedRelinks(on ? new Set() : new Set(importPlan.plan.relinks.map((r) => r.from)))}
            duplicateChoices={duplicateChoices}
            onDuplicateChoice={(key, action) => setDuplicateChoices((prev) => ({ ...prev, [key]: action }))}
          />
        </ConfirmDialog>
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
