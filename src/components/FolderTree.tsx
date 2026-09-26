import { useEffect, useMemo, useState } from 'react'
import { CONTEXT_MENU_Z_INDEX } from './contextMenuStyles'
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
  expanded,
  onToggle,
}: {
  node: FolderTreeNode
  onSelect: (path: string) => void
  depth: number
  selectedFolder: string | null
  rootPath: string
  onContextMenu: (folder: string, isRoot: boolean, x: number, y: number) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const hasChildren = node.children.length > 0
  const isSelected = node.path === selectedFolder
  const showChildren = expanded.has(node.path)

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
              onToggle(node.path)
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
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </div>
  )
}

// Which folders are open, remembered across launches so the tree comes
// back the way it was left. Starts all collapsed the first time — a real
// collection can be deep, and everything open buries the list.
const EXPANDED_FOLDERS_KEY = 'folderTreeExpanded'

function loadExpanded(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_FOLDERS_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((p): p is string => typeof p === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveExpanded(expanded: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...expanded]))
  } catch {
    // Non-essential — fine to lose.
  }
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
  const requestAddManyToQueue = useCollectionStore((s) => s.requestAddManyToQueue)
  const showToast = useCollectionStore((s) => s.showToast)
  const tree = useMemo(() => buildFolderTree(tracks.map((t) => t.folder), rootPath), [tracks, rootPath])
  const [contextMenu, setContextMenu] = useState<{ folder: string; isRoot: boolean; x: number; y: number } | null>(
    null
  )
  const [expanded, setExpanded] = useState(loadExpanded)
  function updateExpanded(next: Set<string>) {
    setExpanded(next)
    saveExpanded(next)
  }

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

  // Opens the selected folder's ancestors (e.g. after "Show in Folder Tree
  // View" from a track's context menu, or on launch) and scrolls its row
  // into view — otherwise the highlighted row could be hidden or
  // off-screen.
  useEffect(() => {
    if (!selectedFolder) return
    const ancestors: string[] = []
    for (let path = selectedFolder; path.length > rootPath.length; path = path.slice(0, path.lastIndexOf('/'))) {
      const parent = path.slice(0, path.lastIndexOf('/'))
      if (parent.length >= rootPath.length) ancestors.push(parent)
    }
    const current = loadExpanded()
    if (ancestors.some((p) => !current.has(p))) updateExpanded(new Set([...current, ...ancestors]))
    requestAnimationFrame(() => {
      document.querySelector(`[data-folder-path="${CSS.escape(selectedFolder)}"]`)?.scrollIntoView({ block: 'center' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder, rootPath])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
        <div
          style={{
            flex: 1,
            cursor: 'pointer',
            fontWeight: 600,
            padding: '2px 4px',
            borderRadius: '4px',
            background: selectedFolder === null ? 'var(--color-surface-raised)' : undefined,
            color: selectedFolder === null ? 'var(--color-accent)' : undefined,
          }}
          onClick={() => onSelect(null)}
        >
          All Tracks
        </div>
        {expanded.size > 0 && (
          <button
            onClick={() => updateExpanded(new Set())}
            title="Collapse all folders"
            aria-label="Collapse all folders"
            style={{ background: 'none', border: 'none', padding: '2px', display: 'flex', color: 'var(--color-text-dim)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              unfold_less
            </span>
          </button>
        )}
      </div>
      <TreeNode
        node={tree}
        onSelect={onSelect}
        depth={0}
        selectedFolder={selectedFolder}
        rootPath={rootPath}
        onContextMenu={(folder, isRoot, x, y) => setContextMenu({ folder, isRoot, x, y })}
        expanded={expanded}
        onToggle={(path) => {
          const next = new Set(expanded)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          updateExpanded(next)
        }}
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
            zIndex: CONTEXT_MENU_Z_INDEX,
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
              if (ids.length > 0) {
                runAnalysis(ids)
                showToast(`Analysing ${ids.length} track${ids.length === 1 ? '' : 's'}…`)
              }
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
              // Confirmation / analyse-now choice handled by QueueDialog.
              requestAddManyToQueue(tracksInFolder(tracks, contextMenu.folder).map((t) => t.id))
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
