import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { buildFolderTree, type FolderTreeNode } from '../state/folderTree'

function TreeNode({
  node,
  onSelect,
  depth,
  selectedFolder,
}: {
  node: FolderTreeNode
  onSelect: (path: string) => void
  depth: number
  selectedFolder: string | null
}) {
  // Starts collapsed — with a large real-world collection this tree can be
  // deep, and showing everything expanded by default buries the folder
  // list under hundreds of nested rows.
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const isSelected = node.path === selectedFolder

  return (
    <div>
      <div
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
            {expanded ? 'expand_more' : 'chevron_right'}
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: '14px' }} />
        )}
        <span className="material-symbols-outlined">folder</span> {node.name}
      </div>
      {expanded &&
        node.children.map((child) => (
          <TreeNode key={child.path} node={child} onSelect={onSelect} depth={depth + 1} selectedFolder={selectedFolder} />
        ))}
    </div>
  )
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
  const tree = useMemo(() => buildFolderTree(tracks.map((t) => t.folder), rootPath), [tracks, rootPath])

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
      <TreeNode node={tree} onSelect={onSelect} depth={0} selectedFolder={selectedFolder} />
    </div>
  )
}
