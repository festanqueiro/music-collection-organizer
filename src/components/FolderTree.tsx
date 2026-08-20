import { useMemo } from 'react'
import { useCollectionStore } from '../state/store'
import { buildFolderTree, type FolderTreeNode } from '../state/folderTree'

function TreeNode({ node, onSelect, depth }: { node: FolderTreeNode; onSelect: (path: string) => void; depth: number }) {
  return (
    <div>
      <div style={{ paddingLeft: `${depth * 16}px`, cursor: 'pointer' }} onClick={() => onSelect(node.path)}>
        <span className="material-symbols-outlined">folder</span> {node.name}
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.path} node={child} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FolderTree({ rootPath, onSelect }: { rootPath: string; onSelect: (path: string | null) => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const tree = useMemo(() => buildFolderTree(tracks.map((t) => t.folder), rootPath), [tracks, rootPath])

  return (
    <div>
      <div style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }} onClick={() => onSelect(null)}>
        All Tracks
      </div>
      <TreeNode node={tree} onSelect={onSelect} depth={0} />
    </div>
  )
}
