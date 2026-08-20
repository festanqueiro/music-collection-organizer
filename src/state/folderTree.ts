export interface FolderTreeNode {
  name: string
  path: string
  children: FolderTreeNode[]
}

export function buildFolderTree(folderPaths: string[], rootPath: string): FolderTreeNode {
  const root: FolderTreeNode = { name: rootPath.split('/').pop() || rootPath, path: rootPath, children: [] }
  const nodeByPath = new Map<string, FolderTreeNode>([[rootPath, root]])

  const sorted = [...new Set(folderPaths)].sort()
  for (const folderPath of sorted) {
    if (folderPath === rootPath) continue
    const relative = folderPath.startsWith(rootPath + '/') ? folderPath.slice(rootPath.length + 1) : folderPath
    const segments = relative.split('/')
    let currentPath = rootPath
    let parent = root
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`
      let node = nodeByPath.get(currentPath)
      if (!node) {
        node = { name: segment, path: currentPath, children: [] }
        nodeByPath.set(currentPath, node)
        parent.children.push(node)
      }
      parent = node
    }
  }
  return root
}
