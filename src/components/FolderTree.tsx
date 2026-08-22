import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { buildFolderTree, type FolderTreeNode } from '../state/folderTree'
import type { Track } from '../types'

const folderContextMenuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  textAlign: 'left' as const,
  background: 'none',
  border: 'none',
  padding: '4px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
}

function TreeNode({
  node,
  onSelect,
  depth,
  selectedFolder,
  rootPath,
  onContextMenu,
}: {
  node: FolderTreeNode
  onSelect: (path: string) => void
  depth: number
  selectedFolder: string | null
  rootPath: string
  onContextMenu: (folder: string, isRoot: boolean, x: number, y: number) => void
}) {
  // Starts collapsed — with a large real-world collection this tree can be
  // deep, and showing everything expanded by default buries the folder
  // list under hundreds of nested rows. A node containing the currently
  // selected folder auto-expands regardless (e.g. "Show in Folder Tree
  // View" from a track's context menu), so the highlighted row is
  // actually reachable without the user manually drilling down to it.
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const isSelected = node.path === selectedFolder
  const containsSelected = selectedFolder !== null && selectedFolder.startsWith(node.path + '/')
  const showChildren = expanded || containsSelected

  return (
    <div>
      <div
        data-folder-path={node.path}
        style={{
          paddingLeft: `${depth * 16}px`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: isSelected ? 'var(--color-surface-raised)' : undefined,
          borderRadius: '4px',
          color: isSelected ? 'var(--color-accent)' : undefined,
        }}
        onClick={() => onSelect(node.path)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(node.path, node.path === rootPath, e.clientX, e.clientY)
        }}
      >
        {hasChildren ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '14px', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {showChildren ? 'expand_more' : 'chevron_right'}
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: '14px' }} />
        )}
        <span className="material-symbols-outlined">folder</span> {node.name}
      </div>
      {showChildren &&
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            onSelect={onSelect}
            depth={depth + 1}
            selectedFolder={selectedFolder}
            rootPath={rootPath}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  )
}

// A track belongs to `folder` if it's directly in it or in any subfolder —
// the same containment rule TrackTable uses to decide which rows a
// selected folder shows.
function tracksInFolder(tracks: Track[], folder: string): Track[] {
  return tracks.filter((t) => t.folder === folder || t.folder.startsWith(folder + '/'))
}

export function FolderTree({
  rootPath,
  selectedFolder,
  onSelect,
}: {
  rootPath: string
  selectedFolder: string | null
  onSelect: (path: string | null) => void
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const addManyToPlaylist = useCollectionStore((s) => s.addManyToPlaylist)
  const tree = useMemo(() => buildFolderTree(tracks.map((t) => t.folder), rootPath), [tracks, rootPath])
  const [contextMenu, setContextMenu] = useState<{ folder: string; isRoot: boolean; x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  // Scrolls the selected folder's row into view once its ancestors have
  // auto-expanded (see TreeNode's containsSelected) — otherwise "Show in
  // Folder Tree View" could highlight a row that's still off-screen.
  useEffect(() => {
    if (!selectedFolder) return
    const row = document.querySelector(`[data-folder-path="${CSS.escape(selectedFolder)}"]`)
    row?.scrollIntoView({ block: 'center' })
  }, [selectedFolder])

  return (
    <div>
      <div
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          marginBottom: '8px',
          padding: '2px 4px',
          borderRadius: '4px',
          background: selectedFolder === null ? 'var(--color-surface-raised)' : undefined,
          color: selectedFolder === null ? 'var(--color-accent)' : undefined,
        }}
        onClick={() => onSelect(null)}
      >
        All Tracks
      </div>
      <TreeNode
        node={tree}
        onSelect={onSelect}
        depth={0}
        selectedFolder={selectedFolder}
        rootPath={rootPath}
        onContextMenu={(folder, isRoot, x, y) => setContextMenu({ folder, isRoot, x, y })}
      />
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '4px',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => {
              // Same status filter as the collection-wide analysis run
              // (pending/error, local only) — a folder-scoped analysis
              // shouldn't force-reanalyze tracks already marked done.
              const ids = tracksInFolder(tracks, contextMenu.folder)
                .filter((t) => t.cloudStatus === 'local' && (t.analysisStatus === 'pending' || t.analysisStatus === 'error'))
                .map((t) => t.id)
              if (ids.length > 0) runAnalysis(ids)
              setContextMenu(null)
            }}
            style={folderContextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              graphic_eq
            </span>
            {contextMenu.isRoot ? 'Analyse collection' : 'Analyse this folder'}
          </button>
          <button
            onClick={() => {
              const ids = tracksInFolder(tracks, contextMenu.folder).map((t) => t.id)
              if (ids.length > 0) addManyToPlaylist(ids)
              setContextMenu(null)
            }}
            style={folderContextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              playlist_add
            </span>
            Add all to queue
          </button>
        </div>
      )}
    </div>
  )
}
