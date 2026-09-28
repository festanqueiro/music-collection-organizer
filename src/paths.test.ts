import { describe, it, expect } from 'vitest'
import { baseName, isInFolder, parentPath, pathSeparator } from './paths'

describe('paths', () => {
  it('uses / for macOS paths and \\ for Windows paths', () => {
    expect(pathSeparator('/Users/me/Music')).toBe('/')
    expect(pathSeparator('C:\\Users\\me\\Music')).toBe('\\')
    expect(pathSeparator('\\\\nas\\music')).toBe('\\')
  })

  it('takes the last segment and the parent', () => {
    expect(baseName('/Users/me/Music/a.mp3')).toBe('a.mp3')
    expect(baseName('C:\\Music\\House\\')).toBe('House')
    expect(parentPath('/Users/me/Music')).toBe('/Users/me')
    expect(parentPath('C:\\Music\\House')).toBe('C:\\Music')
  })

  it('tells whether a path is inside a folder', () => {
    expect(isInFolder('/Music/House/a.mp3', '/Music/House')).toBe(true)
    expect(isInFolder('/Music/House', '/Music/House')).toBe(true)
    expect(isInFolder('/Music/Housework/a.mp3', '/Music/House')).toBe(false)
    expect(isInFolder('C:\\Music\\House\\a.mp3', 'C:\\Music\\House')).toBe(true)
    expect(isInFolder('C:\\Music\\Housework', 'C:\\Music\\House')).toBe(false)
    expect(isInFolder('/Music/a.mp3', '/Music/')).toBe(true)
  })
})
