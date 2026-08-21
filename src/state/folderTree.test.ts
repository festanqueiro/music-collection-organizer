// src/state/folderTree.test.ts
import { describe, it, expect } from 'vitest'
import { buildFolderTree } from './folderTree'

describe('buildFolderTree', () => {
  it('builds a nested tree from flat folder paths', () => {
    const tree = buildFolderTree(['/root/House', '/root/House/Deep', '/root/Techno'], '/root')
    expect(tree.name).toBe('root')
    expect(tree.children.map((c) => c.name).sort()).toEqual(['House', 'Techno'])
    const houseNode = tree.children.find((c) => c.name === 'House')!
    expect(houseNode.children.map((c) => c.name)).toEqual(['Deep'])
  })

  it('deduplicates repeated folder paths', () => {
    const tree = buildFolderTree(['/root/House', '/root/House'], '/root')
    expect(tree.children).toHaveLength(1)
  })
})
