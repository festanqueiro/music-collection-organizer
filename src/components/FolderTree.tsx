import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { buildFolderTree, type FolderTreeNode } from '../state/folderTree'
import type { Track } from '../types'
import { isInFolder, parentPath } from '../paths'
import { ContextMenu } from './ContextMenu'

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
  dropTarget,
  onDropTarget,
  onDropFiles,
}: {
  node: FolderTreeNode
  onSelect: (path: string) => void
  depth: number
  selectedFolder: string | null
  rootPath: string
  onContextMenu: (folder: string, isRoot: boolean, x: number, y: number) => void
  expanded: Set<string>
  onToggle: (path: string) => void
  // The folder files are being dragged over, highlighted as a drop target.
  dropTarget: string | null
  onDropTarget: (path: string | null) => void
  onDropFiles: (folder: string, files: FileList) => void
}) {
  const hasChildren = node.children.length > 0
  const isSelected = node.path === selectedFolder
  const isDropTarget = node.path === dropTarget
  const showChildren = expanded.has(node.path)

  return (
    <div>
      <div
        data-folder-path={node.path}
        title={node.name}
        style={{
          paddingLeft: `${depth * 16}px`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: isDropTarget ? 'var(--color-selected)' : isSelected ? 'var(--color-surface-raised)' : undefined,
          outline: isDropTarget ? '1px solid var(--color-accent)' : undefined,
          borderRadius: '4px',
          color: isSelected || isDropTarget ? 'var(--color-accent)' : undefined,
        }}
        onClick={() => onSelect(node.path)}
        // Tracks dragged from the list arrive as files (the list starts a
        // native file drag, so they can go to Finder too).
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dropTarget !== node.path) onDropTarget(node.path)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDropTarget(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDropTarget(null)
          onDropFiles(node.path, e.dataTransfer.files)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(node.path, node.path === rootPath, e.clientX, e.clientY)
        }}
      >
        {hasChildren ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.path)
            }}
          >
            {showChildren ? 'expand_more' : 'chevron_right'}
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: '14px', flexShrink: 0 }} />
        )}
        <span className="material-symbols-outlined" style={{ flexShrink: 0 }}>folder</span>
        {/* One line per folder; long names end in "…" (full name in the tooltip). */}
        <span style={{ marginLeft: '4px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
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
            dropTarget={dropTarget}
            onDropTarget={onDropTarget}
            onDropFiles={onDropFiles}
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
  return tracks.filter((t) => isInFolder(t.folder, folder))
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
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const moveTracksToFolder = useCollectionStore((s) => s.moveTracksToFolder)

  // Dropped files that are tracks of the collection (by path) move into
  // the folder, after asking; anything else dropped here is ignored.
  function handleDropFiles(folder: string, files: FileList) {
    const byPath = new Map(tracks.map((t) => [t.path, t.id]))
    const ids = Array.from(files)
      .map((file) => byPath.get(window.api.pathForFile(file)))
      .filter((id): id is number => id !== undefined)
    if (ids.length === 0) {
      if (files.length > 0) showToast('Only tracks from the collection can be moved here')
      return
    }
    void moveTracksToFolder(ids, folder)
  }

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
    for (let path = selectedFolder; path.length > rootPath.length; path = parentPath(path)) {
      const parent = parentPath(path)
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
        dropTarget={dropTarget}
        onDropTarget={setDropTarget}
        onDropFiles={handleDropFiles}
        expanded={expanded}
        onToggle={(path) => {
          const next = new Set(expanded)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          updateExpanded(next)
        }}
      />
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y}>
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
        </ContextMenu>
      )}
    </div>
  )
}
